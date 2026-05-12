// =============================================================
//  fuzzy-engine.ts — Fuzzy Logic Kandang Ayam Broiler
//  Port dari fuzzy.h (Arduino) ke TypeScript (Next.js)
//
//  Input  : age     = umur ayam (hari, 0–50)
//           tempAct = suhu aktual (°C)
//           humAct  = kelembaban aktual (%)
//
//  Setpoint per fase (dihitung otomatis di dalam engine):
//  ┌──────┬───────────────┬────────────┐
//  │ Fase │  Suhu (°C)    │  RH (%)    │
//  ├──────┼───────────────┼────────────┤
//  │ BA   │  31 – 34      │  60 – 65   │
//  │ BL   │  30 – 31      │  60 – 65   │
//  │ T    │  28 – 29      │  60 – 65   │
//  │ PA   │  25 – 27      │  60 – 65   │
//  │ PL   │  24 – 25      │  60 – 65   │
//  └──────┴───────────────┴────────────┘
//  Setpoint = titik tengah range masing-masing fase.
//  e_s = T_setpoint − T_aktual  (range BA: ±2.0°C, BL–PL: ±1.0°C)
//  e_k = H_setpoint − H_aktual  (range semua fase: ±2.5%)
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
  /** Setpoint yang digunakan berdasarkan fase dominan */
  setpoint: { temp: number; hum: number };
  /** Error yang dihitung engine: e_s = T_sp − T_aktual, e_k = H_sp − H_aktual */
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
  /** Negatif Besar — suhu aktual JAUH LEBIH PANAS dari setpoint */
  NB: number;
  /** Negatif Kecil — suhu aktual sedikit panas */
  NK: number;
  /** Zero — suhu ideal */
  Z: number;
  /** Positif Kecil — suhu aktual sedikit dingin */
  PK: number;
  /** Positif Besar — suhu aktual JAUH LEBIH DINGIN dari setpoint */
  PB: number;
}

export interface HumFS {
  /** Negatif Besar — kelembaban aktual JAUH LEBIH LEMBAP dari setpoint */
  NB: number;
  /** Negatif Kecil — sedikit lembap */
  NK: number;
  /** Zero — kelembaban ideal */
  Z: number;
  /** Positif Kecil — sedikit kering */
  PK: number;
  /** Positif Besar — kelembaban aktual JAUH LEBIH KERING dari setpoint */
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
//  BAGIAN 1: SETPOINT PER FASE UMUR
// -------------------------------------------------------------

/**
 * Tabel setpoint suhu dan kelembaban per fase umur.
 * Nilai = titik tengah range masing-masing fase:
 *   BA  → Suhu (31+34)/2 = 32.5°C,  RH (60+65)/2 = 62.5%
 *   BL  → Suhu (30+31)/2 = 30.5°C,  RH 62.5%
 *   T   → Suhu (28+29)/2 = 28.5°C,  RH 62.5%
 *   PA  → Suhu (25+27)/2 = 26.0°C,  RH 62.5%
 *   PL  → Suhu (24+25)/2 = 24.5°C,  RH 62.5%
 */
export const SETPOINT_TABLE: Record<AgeKey, { temp: number; hum: number }> = {
  BA: { temp: 32.5, hum: 62.5 },
  BL: { temp: 30.5, hum: 62.5 },
  T:  { temp: 28.5, hum: 62.5 },
  PA: { temp: 26.0, hum: 62.5 },
  PL: { temp: 24.5, hum: 62.5 },
};

/** Kembalikan setpoint berdasarkan fase umur dominan (untuk UI). */
export function getSetpoint(dominantAge: AgeKey): { temp: number; hum: number } {
  return SETPOINT_TABLE[dominantAge];
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
 * Fuzzifikasi Error Suhu — FASE BA (0–10 hari), range ±2.0°C.
 * e_s negatif = suhu aktual LEBIH PANAS dari setpoint.
 * e_s positif = suhu aktual LEBIH DINGIN dari setpoint.
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
 * Fuzzifikasi Error Suhu — FASE BL hingga PL (>10 hari), range ±1.0°C.
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
 * Fuzzifikasi Error Kelembaban (semua fase), range ±2.5%.
 * e_k negatif = kelembaban aktual LEBIH LEMBAP dari setpoint.
 * e_k positif = kelembaban aktual LEBIH KERING dari setpoint.
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
//  Output sama untuk semua fase umur [BA,BL,T,PA,PL].
//  Fase umur berperan sebagai MODERATOR BOBOT via AND.
//
//  Kode : S=SR  R=R  N=N  T=T  X=ST
//
//  Logika:
//  · Dimmer ↑  saat suhu aktual PANAS  (e_s negatif: NB/NK)
//  · Dimmer ↓  saat suhu aktual DINGIN (e_s positif: PK/PB)
//  · VFD ↑     saat RH KERING (e_k positif: PK/PB) / suhu sangat panas
//  · VFD ↓     saat kondisi ideal / RH lembap + suhu dingin
// -------------------------------------------------------------

export const AGE_KEYS: AgeKey[] = ['BA', 'BL', 'T', 'PA', 'PL'];

const CHAR_TO_KEY: Record<RuleCode, OutputKey> = {
  S: 'SR', R: 'R', N: 'N', T: 'T', X: 'ST',
};

const RULE_TABLE: [EsKey, EkKey, RuleCode[], RuleCode[]][] = [
  // ── e_s = NB (suhu aktual SANGAT PANAS) ──
  ['NB', 'NB', ['N','N','N','N','N'], ['X','X','X','X','X']],
  ['NB', 'NK', ['R','R','R','R','R'], ['X','X','X','X','X']],
  ['NB', 'Z',  ['R','R','R','R','R'], ['X','X','X','X','X']],
  ['NB', 'PK', ['N','N','N','N','N'], ['X','X','X','X','X']],
  ['NB', 'PB', ['T','T','T','T','T'], ['X','X','X','X','X']],
  // ── e_s = NK (suhu aktual AGAK PANAS) ──
  ['NK', 'NB', ['N','N','N','N','N'], ['T','T','T','T','T']],
  ['NK', 'NK', ['R','R','R','R','R'], ['T','T','T','T','T']],
  ['NK', 'Z',  ['R','R','R','R','R'], ['T','T','T','T','T']],
  ['NK', 'PK', ['N','N','N','N','N'], ['T','T','T','T','T']],
  ['NK', 'PB', ['T','T','T','T','T'], ['T','T','T','T','T']],
  // ── e_s = Z  (suhu IDEAL) ──
  ['Z',  'NB', ['N','N','N','N','N'], ['S','S','S','S','S']],
  ['Z',  'NK', ['S','S','S','S','S'], ['R','R','R','R','R']],
  ['Z',  'Z',  ['S','S','S','S','S'], ['S','S','S','S','S']],
  ['Z',  'PK', ['T','T','T','T','T'], ['S','S','S','S','S']],
  ['Z',  'PB', ['X','X','X','X','X'], ['S','S','S','S','S']],
  // ── e_s = PK (suhu aktual AGAK DINGIN) ──
  ['PK', 'NB', ['N','N','N','N','N'], ['R','R','R','R','R']],
  ['PK', 'NK', ['T','T','T','T','T'], ['R','R','R','R','R']],
  ['PK', 'Z',  ['T','T','T','T','T'], ['R','R','R','R','R']],
  ['PK', 'PK', ['T','T','T','T','T'], ['R','R','R','R','R']],
  ['PK', 'PB', ['X','X','X','X','X'], ['R','R','R','R','R']],
  // ── e_s = PB (suhu aktual SANGAT DINGIN) ──
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
 *  2. Ambil setpoint dari SETPOINT_TABLE berdasarkan fase dominan
 *  3. Hitung e_s = T_setpoint − T_aktual
 *  4. Hitung e_k = H_setpoint − H_aktual
 *  5. Pilih fungsi keanggotaan suhu (BA: ±2°C / BL–PL: ±1°C)
 *  6. Fuzzifikasi e_s dan e_k
 *  7. Inferensi Mamdani (AND=min, OR=max)
 *  8. Defuzzifikasi weighted average → skala 0–100%
 *  9. Konversi ke PWM 8-bit (0–255)
 */
export function infer(age: number, tempAct: number, humAct: number): FuzzyResult {
  // 1. Fuzzifikasi umur
  const ageMF       = fuzzifyAge(age);

  // 2. Fase dominan & setpoint
  const dominantAge = getDominantAge(ageMF);
  const setpoint    = getSetpoint(dominantAge);

  // 3–4. Hitung error
  const es = setpoint.temp - tempAct;  // positif = aktual lebih DINGIN
  const ek = setpoint.hum  - humAct;   // positif = aktual lebih KERING

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
  NB: 'NB – Suhu Sangat Panas   (e_s sangat negatif)',
  NK: 'NK – Suhu Agak Panas     (e_s sedikit negatif)',
  Z:  'Z  – Suhu Ideal          (e_s ≈ 0)',
  PK: 'PK – Suhu Agak Dingin    (e_s sedikit positif)',
  PB: 'PB – Suhu Sangat Dingin  (e_s sangat positif)',
};

export const HUM_LABELS: Record<keyof HumFS, string> = {
  NB: 'NB – Sangat Lembap   (e_k sangat negatif)',
  NK: 'NK – Agak Lembap     (e_k sedikit negatif)',
  Z:  'Z  – RH Ideal        (e_k ≈ 0)',
  PK: 'PK – Agak Kering     (e_k sedikit positif)',
  PB: 'PB – Sangat Kering   (e_k sangat positif)',
};

export const ES_KEYS_ORDERED: EsKey[] = ['NB', 'NK', 'Z', 'PK', 'PB'];
export const EK_KEYS_ORDERED: EkKey[] = ['NB', 'NK', 'Z', 'PK', 'PB'];
