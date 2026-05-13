// =============================================================
//  fuzzy-engine.ts — Fuzzy Logic Kandang Ayam Broiler
//  Port dari fuzzy.h (Arduino) ke TypeScript (Next.js)
//
//  Input  : age     = umur ayam (hari, 0–50)
//           tempAct = suhu aktual sensor (°C)
//           humAct  = kelembaban aktual sensor (%)
//
//  Setpoint per fase menggunakan DEAD BAND (range, bukan titik tengah):
//  ┌──────┬─────────────────┬──────────────────┐
//  │ Fase │  Suhu (°C)      │  RH (%)          │
//  ├──────┼─────────────────┼──────────────────┤
//  │ BA   │  31.0 – 34.0    │  60.0 – 65.0     │
//  │ BL   │  30.0 – 31.0    │  60.0 – 65.0     │
//  │ T    │  28.0 – 29.0    │  60.0 – 65.0     │
//  │ PA   │  25.0 – 27.0    │  60.0 – 65.0     │
//  │ PL   │  24.0 – 25.0    │  60.0 – 65.0     │
//  └──────┴─────────────────┴──────────────────┘
//
//  Logika error (dead band):
//    actual < min  →  e = min − actual  (positif = terlalu dingin/kering)
//    actual > max  →  e = max − actual  (negatif = terlalu panas/lembap)
//    min ≤ actual ≤ max  →  e = 0      (dalam range ideal, tidak ada error)
//
//  Range error suhu    : BA → ±2.0°C  |  BL–PL → ±1.0°C
//  Range error kelembaban: semua fase → ±2.5%
//
//  Output : vfdScore    = PWM VFD / kipas   (0–255)
//           dimmerScore = PWM AC Dimmer     (0–255)
// =============================================================

// -------------------------------------------------------------
//  TYPES
// -------------------------------------------------------------

export interface FuzzyResult {
  /** PWM VFD kipas 0–255 */
  vfdScore: number;
  /** PWM AC Dimmer pemanas 0–255 */
  dimmerScore: number;
  /** Centroid VFD (0–100 %) sebelum konversi ke PWM */
  rawVfd: number;
  /** Centroid Dimmer (0–100 %) sebelum konversi ke PWM */
  rawDim: number;
  /** Fase umur dominan (penentu setpoint & fungsi keanggotaan suhu) */
  dominantAge: AgeKey;
  /** Setpoint range yang digunakan berdasarkan fase dominan */
  setpoint: Setpoint;
  /** Error yang dihitung engine dengan logika dead band */
  error: { es: number; ek: number };
  /** Derajat keanggotaan input */
  membership: {
    age: AgeFS;
    temp: TempFS;
    hum: HumFS;
  };
  /** Derajat agregasi output */
  output: {
    vfd: OutputFS;
    dim: OutputFS;
  };
  /** Semua rule beserta bobot */
  ruleWeights: RuleWeight[];
}

export interface Setpoint {
  tempMin: number;
  tempMax: number;
  humMin:  number;
  humMax:  number;
}

export interface AgeFS {
  /** Brooding Awal        0–10 hari */
  BA: number;
  /** Brooding Lanjutan    5–18 hari */
  BL: number;
  /** Transisi            14–28 hari */
  T: number;
  /** Pembesaran Awal     24–38 hari */
  PA: number;
  /** Pembesaran Lanjutan 35–50 hari */
  PL: number;
}

export interface TempFS {
  /** Negatif Besar — suhu aktual JAUH LEBIH PANAS dari batas atas setpoint */
  NB: number;
  /** Negatif Kecil — suhu aktual sedikit di atas batas atas setpoint */
  NK: number;
  /** Zero — suhu aktual dalam range ideal (dead band) */
  Z: number;
  /** Positif Kecil — suhu aktual sedikit di bawah batas bawah setpoint */
  PK: number;
  /** Positif Besar — suhu aktual JAUH di bawah batas bawah setpoint */
  PB: number;
}

export interface HumFS {
  /** Negatif Besar — RH aktual JAUH di atas batas atas setpoint */
  NB: number;
  /** Negatif Kecil — RH aktual sedikit di atas batas atas setpoint */
  NK: number;
  /** Zero — RH aktual dalam range ideal (dead band) */
  Z: number;
  /** Positif Kecil — RH aktual sedikit di bawah batas bawah setpoint */
  PK: number;
  /** Positif Besar — RH aktual JAUH di bawah batas bawah setpoint */
  PB: number;
}

export interface OutputFS {
  /** Sangat Rendah — centroid 10 */
  SR: number;
  /** Rendah        — centroid 30 */
  R: number;
  /** Normal        — centroid 50 */
  N: number;
  /** Tinggi        — centroid 70 */
  T: number;
  /** Sangat Tinggi — centroid 90 */
  ST: number;
}

export type EsKey     = 'NB' | 'NK' | 'Z' | 'PK' | 'PB';
export type EkKey     = 'NB' | 'NK' | 'Z' | 'PK' | 'PB';
export type AgeKey    = 'BA' | 'BL' | 'T' | 'PA' | 'PL';
export type OutputKey = 'SR' | 'R'  | 'N' | 'T'  | 'ST';
export type RuleCode  = 'S'  | 'R'  | 'N' | 'T'  | 'X';

export interface RuleWeight {
  esKey: EsKey;
  ekKey: EkKey;
  /** Firing strength AND (min µ_es, µ_ek) */
  w: number;
  /** Bobot akhir per himpunan umur [BA, BL, T, PA, PL] */
  ageWeights: number[];
  /** Kode output VFD per umur */
  vCodes: RuleCode[];
  /** Kode output Dimmer per umur */
  dCodes: RuleCode[];
}

// -------------------------------------------------------------
//  BAGIAN 1: SETPOINT PER FASE UMUR (DEAD BAND)
// -------------------------------------------------------------

/**
 * Tabel setpoint range suhu dan kelembaban per fase umur.
 * Error = 0 selama nilai aktual berada di dalam range [min, max].
 * Error dihitung hanya saat nilai aktual keluar dari range.
 *
 *   actual < min  →  e = min − actual  (+, terlalu dingin/kering)
 *   actual > max  →  e = max − actual  (−, terlalu panas/lembap)
 *   min ≤ actual ≤ max  →  e = 0
 */
export const SETPOINT_TABLE: Record<AgeKey, Setpoint> = {
  BA: { tempMin: 31.0, tempMax: 34.0, humMin: 60.0, humMax: 65.0 },
  BL: { tempMin: 30.0, tempMax: 31.0, humMin: 60.0, humMax: 65.0 },
  T:  { tempMin: 28.0, tempMax: 29.0, humMin: 60.0, humMax: 65.0 },
  PA: { tempMin: 25.0, tempMax: 27.0, humMin: 60.0, humMax: 65.0 },
  PL: { tempMin: 24.0, tempMax: 25.0, humMin: 60.0, humMax: 65.0 },
};

/** Kembalikan setpoint range berdasarkan fase umur dominan (untuk UI). */
export function getSetpoint(dominantAge: AgeKey): Setpoint {
  return SETPOINT_TABLE[dominantAge];
}

/**
 * Hitung error dengan logika dead band.
 * Jika nilai aktual berada di dalam range [min, max], error = 0.
 * Jika di bawah min, error positif (perlu pemanasan/pembasahan).
 * Jika di atas max, error negatif (perlu pendinginan/pengeringan).
 *
 * @param actual - Nilai aktual sensor
 * @param min    - Batas bawah setpoint
 * @param max    - Batas atas setpoint
 */
export function calcError(actual: number, min: number, max: number): number {
  if (actual < min) return min - actual;   // positif: aktual < batas bawah
  if (actual > max) return max - actual;   // negatif: aktual > batas atas
  return 0;                                // dalam range: tidak ada error
}

// -------------------------------------------------------------
//  BAGIAN 2: FUNGSI KEANGGOTAAN DASAR
// -------------------------------------------------------------

/**
 * Trapesium: naik a→b, datar b→c, turun c→d.
 * Plateau kiri  (a === b): return 1 saat x <= b.
 * Plateau kanan (c === d): return 1 saat x >= c.
 */
export function fTrap(
  x: number,
  a: number,
  b: number,
  c: number,
  d: number,
): number {
  if (x <= a && a !== b) return 0;
  if (x >= d && c !== d) return 0;
  if (x >= b && x <= c)  return 1;
  if (x < b && b > a)    return (x - a) / (b - a);
  if (x > c && d > c)    return (d - x) / (d - c);
  return 1;
}

/** Segitiga: naik a→b, turun b→c */
export function fTri(x: number, a: number, b: number, c: number): number {
  if (x <= a || x >= c) return 0;
  if (x === b)          return 1;
  if (x < b)            return (x - a) / (b - a);
  return (c - x) / (c - b);
}

// -------------------------------------------------------------
//  BAGIAN 3: FUZZIFIKASI
// -------------------------------------------------------------

/**
 * Fuzzifikasi Umur Ayam (0–50 hari).
 * Edge case umur = 0  → BA = 1 (plateau kiri).
 * Edge case umur ≥ 40 → PL = 1 (plateau kanan).
 */
export function fuzzifyAge(age: number): AgeFS {
  return {
    BA: fTrap(age,  0,  0,  5, 10),
    BL: fTrap(age,  5, 10, 13, 18),
    T:  fTrap(age, 14, 18, 22, 28),
    PA: fTrap(age, 24, 28, 32, 38),
    PL: fTrap(age, 35, 40, 50, 50),
  };
}

/**
 * Fuzzifikasi Error Suhu — FASE BA (0–10 hari).
 * Range error: ±2.0°C (jarak maksimum keluar dari range BA: 31–34°C).
 * e_s = 0     → suhu dalam range ideal (dead band aktif)
 * e_s negatif → suhu aktual LEBIH PANAS dari batas atas setpoint
 * e_s positif → suhu aktual LEBIH DINGIN dari batas bawah setpoint
 */
export function fuzzifyTempBA(es: number): TempFS {
  return {
    NB: fTrap(es, -2.0, -2.0, -1.5, -1.0),
    NK: fTri( es, -1.5, -1.0,  0.0),
    Z:  fTri( es, -0.5,  0.0,  0.5),
    PK: fTri( es,  0.0,  1.0,  1.5),
    PB: fTrap(es,  1.0,  1.5,  2.0,  2.0),
  };
}

/**
 * Fuzzifikasi Error Suhu — FASE BL hingga PL (>10 hari).
 * Range error: ±1.0°C (range setpoint lebih sempit di fase lanjut).
 */
export function fuzzifyTempBL(es: number): TempFS {
  return {
    NB: fTrap(es, -1.0, -1.0, -0.75, -0.5),
    NK: fTri( es, -0.75, -0.5,  0.0),
    Z:  fTri( es, -0.25,  0.0,  0.25),
    PK: fTri( es,  0.0,   0.5,  0.75),
    PB: fTrap(es,  0.5,   0.75, 1.0,  1.0),
  };
}

/**
 * Fuzzifikasi Error Kelembaban (semua fase).
 * Range error: ±2.5% (jarak maksimum keluar dari range RH: 60–65%).
 * e_k = 0     → RH dalam range ideal (dead band aktif)
 * e_k negatif → RH aktual LEBIH LEMBAP dari batas atas setpoint
 * e_k positif → RH aktual LEBIH KERING dari batas bawah setpoint
 */
export function fuzzifyHum(ek: number): HumFS {
  return {
    NB: fTrap(ek, -2.5, -2.5, -1.5, -0.75),
    NK: fTri( ek, -1.5, -0.75,  0.0),
    Z:  fTri( ek, -0.5,  0.0,   0.5),
    PK: fTri( ek,  0.0,  0.75,  1.5),
    PB: fTrap(ek,  0.75, 1.5,   2.5,  2.5),
  };
}

// -------------------------------------------------------------
//  BAGIAN 4: RULE BASE
//  25 rules — 5 e_s × 5 e_k
//  Output seragam untuk semua fase umur [BA,BL,T,PA,PL].
//  Fase umur berperan sebagai MODERATOR BOBOT via AND.
//
//  Kode : S=SR  R=R  N=N  T=T  X=ST
//
//  Logika:
//  · e_s = Z  → suhu dalam dead band → Dimmer minimal
//  · e_s = NB/NK → suhu terlalu PANAS → Dimmer tinggi (kurangi panas)
//  · e_s = PK/PB → suhu terlalu DINGIN → Dimmer rendah (tidak perlu panas)
//  · e_k = Z  → RH dalam dead band → VFD sesuai kondisi suhu
//  · e_k = NB/NK → RH terlalu LEMBAP → VFD tinggi (sirkulasi)
//  · e_k = PK/PB → RH terlalu KERING → VFD sangat tinggi (distribusi uap)
// -------------------------------------------------------------

export const AGE_KEYS: AgeKey[] = ['BA', 'BL', 'T', 'PA', 'PL'];

const CHAR_TO_KEY: Record<RuleCode, OutputKey> = {
  S: 'SR', R: 'R', N: 'N', T: 'T', X: 'ST',
};

const RULE_TABLE: [EsKey, EkKey, RuleCode[], RuleCode[]][] = [
  // ── e_s = NB (suhu SANGAT PANAS, jauh di atas batas atas) ──
  ['NB', 'NB', ['N','N','N','N','N'], ['X','X','X','X','X']],
  ['NB', 'NK', ['R','R','R','R','R'], ['X','X','X','X','X']],
  ['NB', 'Z',  ['R','R','R','R','R'], ['X','X','X','X','X']],
  ['NB', 'PK', ['N','N','N','N','N'], ['X','X','X','X','X']],
  ['NB', 'PB', ['T','T','T','T','T'], ['X','X','X','X','X']],
  // ── e_s = NK (suhu AGAK PANAS, sedikit di atas batas atas) ──
  ['NK', 'NB', ['N','N','N','N','N'], ['T','T','T','T','T']],
  ['NK', 'NK', ['R','R','R','R','R'], ['T','T','T','T','T']],
  ['NK', 'Z',  ['R','R','R','R','R'], ['T','T','T','T','T']],
  ['NK', 'PK', ['N','N','N','N','N'], ['T','T','T','T','T']],
  ['NK', 'PB', ['T','T','T','T','T'], ['T','T','T','T','T']],
  // ── e_s = Z (suhu DALAM RANGE IDEAL — dead band aktif) ──
  ['Z',  'NB', ['N','N','N','N','N'], ['S','S','S','S','S']],
  ['Z',  'NK', ['S','S','S','S','S'], ['R','R','R','R','R']],
  ['Z',  'Z',  ['S','S','S','S','S'], ['S','S','S','S','S']],
  ['Z',  'PK', ['T','T','T','T','T'], ['S','S','S','S','S']],
  ['Z',  'PB', ['X','X','X','X','X'], ['S','S','S','S','S']],
  // ── e_s = PK (suhu AGAK DINGIN, sedikit di bawah batas bawah) ──
  ['PK', 'NB', ['N','N','N','N','N'], ['R','R','R','R','R']],
  ['PK', 'NK', ['T','T','T','T','T'], ['R','R','R','R','R']],
  ['PK', 'Z',  ['T','T','T','T','T'], ['R','R','R','R','R']],
  ['PK', 'PK', ['T','T','T','T','T'], ['R','R','R','R','R']],
  ['PK', 'PB', ['X','X','X','X','X'], ['R','R','R','R','R']],
  // ── e_s = PB (suhu SANGAT DINGIN, jauh di bawah batas bawah) ──
  ['PB', 'NB', ['N','N','N','N','N'], ['S','S','S','S','S']],
  ['PB', 'NK', ['T','T','T','T','T'], ['S','S','S','S','S']],
  ['PB', 'Z',  ['T','T','T','T','T'], ['S','S','S','S','S']],
  ['PB', 'PK', ['X','X','X','X','X'], ['S','S','S','S','S']],
  ['PB', 'PB', ['X','X','X','X','X'], ['S','S','S','S','S']],
];

// -------------------------------------------------------------
//  BAGIAN 5: INFERENSI (AND = min, OR = max)
// -------------------------------------------------------------

function applyRules(
  a: AgeFS,
  t: TempFS,
  h: HumFS,
): { vfd: OutputFS; dim: OutputFS; ruleWeights: RuleWeight[] } {
  const vfd: OutputFS = { SR: 0, R: 0, N: 0, T: 0, ST: 0 };
  const dim: OutputFS = { SR: 0, R: 0, N: 0, T: 0, ST: 0 };
  const ruleWeights: RuleWeight[] = [];

  for (const [esKey, ekKey, vCodes, dCodes] of RULE_TABLE) {
    const w          = Math.min(t[esKey], h[ekKey]);
    const ageWeights = AGE_KEYS.map((ak) => Math.min(w, a[ak]));

    ruleWeights.push({ esKey, ekKey, w, ageWeights, vCodes, dCodes });

    if (w < 0.001) continue;

    AGE_KEYS.forEach((ak, i) => {
      const aw   = ageWeights[i];
      if (aw < 0.001) return;
      const vKey = CHAR_TO_KEY[vCodes[i]];
      const dKey = CHAR_TO_KEY[dCodes[i]];
      vfd[vKey]  = Math.max(vfd[vKey], aw);
      dim[dKey]  = Math.max(dim[dKey], aw);
    });
  }

  return { vfd, dim, ruleWeights };
}

// -------------------------------------------------------------
//  BAGIAN 6: DEFUZZIFIKASI — Weighted Average
//  Centroid: SR=10, R=30, N=50, T=70, ST=90  (skala 0–100%)
// -------------------------------------------------------------

export const OUTPUT_CENTROIDS: Record<OutputKey, number> = {
  SR: 10, R: 30, N: 50, T: 70, ST: 90,
};

export function defuzzify(fs: OutputFS): number {
  const num =
    fs.SR * 10 + fs.R * 30 + fs.N * 50 + fs.T * 70 + fs.ST * 90;
  const den = fs.SR + fs.R + fs.N + fs.T + fs.ST;
  return den > 0.001 ? num / den : 0;
}

// -------------------------------------------------------------
//  HELPER: Fase umur dominan
// -------------------------------------------------------------

function getDominantAge(ageMF: AgeFS): AgeKey {
  let maxVal   = -1;
  let dominant: AgeKey = 'BA';
  for (const key of AGE_KEYS) {
    if (ageMF[key] > maxVal) {
      maxVal   = ageMF[key];
      dominant = key as AgeKey;
    }
  }
  return dominant;
}

// -------------------------------------------------------------
//  FUNGSI UTAMA
// -------------------------------------------------------------

/**
 * Hitung output fuzzy Mamdani untuk kandang ayam broiler.
 *
 * @param age     Umur ayam dalam hari (0–50)
 * @param tempAct Suhu aktual sensor (°C)
 * @param humAct  Kelembaban aktual sensor (%)
 *
 * Alur internal engine:
 *  1. Fuzzifikasi umur → tentukan fase dominan
 *  2. Ambil setpoint RANGE dari SETPOINT_TABLE
 *  3. Hitung e_s dengan dead band: calcError(tempAct, tempMin, tempMax)
 *  4. Hitung e_k dengan dead band: calcError(humAct,  humMin,  humMax)
 *  5. Pilih fungsi keanggotaan suhu (BA: ±2°C / BL–PL: ±1°C)
 *  6. Fuzzifikasi e_s dan e_k
 *  7. Inferensi Mamdani (AND=min, OR=max)
 *  8. Defuzzifikasi weighted average → 0–100%
 *  9. Konversi ke PWM 8-bit (0–255)
 */
export function infer(age: number, tempAct: number, humAct: number): FuzzyResult {
  // 1. Fuzzifikasi umur
  const ageMF       = fuzzifyAge(age);

  // 2. Fase dominan & setpoint range
  const dominantAge = getDominantAge(ageMF);
  const setpoint    = getSetpoint(dominantAge);

  // 3–4. Hitung error dengan dead band
  const es = calcError(tempAct, setpoint.tempMin, setpoint.tempMax);
  const ek = calcError(humAct,  setpoint.humMin,  setpoint.humMax);

  // 5–6. Fuzzifikasi suhu & kelembaban
  const tempMF = dominantAge === 'BA'
    ? fuzzifyTempBA(es)
    : fuzzifyTempBL(es);
  const humMF  = fuzzifyHum(ek);

  // 7. Inferensi + agregasi
  const { vfd, dim, ruleWeights } = applyRules(ageMF, tempMF, humMF);

  // 8. Defuzzifikasi (0–100%)
  const rawVfd = defuzzify(vfd);
  const rawDim = defuzzify(dim);

  // 9. Konversi ke PWM 8-bit
  const vfdScore    = Math.round((rawVfd / 100) * 255);
  const dimmerScore = Math.round((rawDim / 100) * 255);

  return {
    vfdScore,
    dimmerScore,
    rawVfd,
    rawDim,
    dominantAge,
    setpoint,
    error: { es, ek },
    membership: { age: ageMF, temp: tempMF, hum: humMF },
    output: { vfd, dim },
    ruleWeights,
  };
}

// -------------------------------------------------------------
//  CONSTANTS — untuk komponen UI
// -------------------------------------------------------------

export const OUTPUT_KEYS: OutputKey[] = ['SR', 'R', 'N', 'T', 'ST'];

export const OUTPUT_LABELS: Record<OutputKey, string> = {
  SR: 'SR – Sangat Rendah',
  R:  'R  – Rendah',
  N:  'N  – Normal',
  T:  'T  – Tinggi',
  ST: 'ST – Sangat Tinggi',
};

export const AGE_LABELS: Record<AgeKey, string> = {
  BA: 'BA – Brooding Awal       (0–10 hari)',
  BL: 'BL – Brooding Lanjutan   (5–18 hari)',
  T:  'T  – Transisi            (14–28 hari)',
  PA: 'PA – Pembesaran Awal     (24–38 hari)',
  PL: 'PL – Pembesaran Lanjutan (35–50 hari)',
};

export const TEMP_LABELS: Record<keyof TempFS, string> = {
  NB: 'NB – Suhu Sangat Panas   (jauh di atas batas atas setpoint)',
  NK: 'NK – Suhu Agak Panas     (sedikit di atas batas atas setpoint)',
  Z:  'Z  – Suhu Ideal          (dalam range dead band)',
  PK: 'PK – Suhu Agak Dingin    (sedikit di bawah batas bawah setpoint)',
  PB: 'PB – Suhu Sangat Dingin  (jauh di bawah batas bawah setpoint)',
};

export const HUM_LABELS: Record<keyof HumFS, string> = {
  NB: 'NB – Sangat Lembap   (jauh di atas batas atas setpoint)',
  NK: 'NK – Agak Lembap     (sedikit di atas batas atas setpoint)',
  Z:  'Z  – RH Ideal        (dalam range dead band)',
  PK: 'PK – Agak Kering     (sedikit di bawah batas bawah setpoint)',
  PB: 'PB – Sangat Kering   (jauh di bawah batas bawah setpoint)',
};

export const ES_KEYS_ORDERED: EsKey[] = ['NB', 'NK', 'Z', 'PK', 'PB'];
export const EK_KEYS_ORDERED: EkKey[] = ['NB', 'NK', 'Z', 'PK', 'PB'];
