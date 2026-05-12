// =============================================================
//  fuzzy-engine.ts — Fuzzy Logic Kandang Ayam Broiler
//  Port dari fuzzy.h (Arduino) ke TypeScript (Next.js)
//
//  Input  : age  = umur ayam (hari, 0–50)
//           e_s  = error suhu       = T_setpoint - T_aktual (°C)
//                  Range BA  (0–10 hari) : -2.0 .. +2.0
//                  Range BL–PL (>10 hari): -1.0 .. +1.0
//           e_k  = error kelembaban = H_setpoint - H_aktual (%, -2.5..+2.5)
//
//  Output : vfdScore    = PWM VFD / kipas   (0–255)
//           dimmerScore = PWM AC Dimmer     (0–255)
//
//  Perubahan dari versi sebelumnya:
//  - fuzzifyTemp dipecah menjadi fuzzifyTempBA (range ±2) dan
//    fuzzifyTempBL (range ±1), dipilih otomatis oleh infer()
//  - fuzzifyHum diperbarui ke range ±2.5
//  - fuzzifyAge: edge case umur=0 ditangani (return BA=1)
//  - infer(): fase umur dominan menentukan fungsi keanggotaan suhu
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
  /** Fase umur dominan yang digunakan untuk memilih fungsi keanggotaan suhu */
  dominantAge: AgeKey;
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
  /** Negatif Besar — suhu jauh LEBIH PANAS dari setpoint */
  NB: number;
  /** Negatif Kecil — suhu sedikit panas */
  NK: number;
  /** Zero — suhu ideal */
  Z: number;
  /** Positif Kecil — suhu sedikit dingin */
  PK: number;
  /** Positif Besar — suhu jauh LEBIH DINGIN dari setpoint */
  PB: number;
}

export interface HumFS {
  /** Negatif Besar — kelembaban jauh LEBIH LEMBAP dari setpoint */
  NB: number;
  /** Negatif Kecil — sedikit lembap */
  NK: number;
  /** Zero — kelembaban ideal */
  Z: number;
  /** Positif Kecil — sedikit kering */
  PK: number;
  /** Positif Besar — jauh LEBIH KERING dari setpoint */
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
  /** Bobot AND (min µ_es × µ_ek) */
  w: number;
  /** Bobot akhir per himpunan umur [BA, BL, T, PA, PL] */
  ageWeights: number[];
  /** Kode output VFD per umur */
  vCodes: RuleCode[];
  /** Kode output Dimmer per umur */
  dCodes: RuleCode[];
}

// -------------------------------------------------------------
//  BAGIAN 1: FUNGSI KEANGGOTAAN DASAR
// -------------------------------------------------------------

/**
 * Trapesium: naik a→b, datar b→c, turun c→d.
 * Nilai tepat di a atau d menghasilkan 0 (batas eksklusif).
 * Khusus untuk batas terbuka (plateau kiri: a===b, plateau kanan: c===d)
 * ditangani dengan clamp.
 */
export function fTrap(
  x: number,
  a: number,
  b: number,
  c: number,
  d: number,
): number {
  if (x <= a && a !== b) return 0;          // di bawah batas kiri
  if (x >= d && c !== d) return 0;          // di atas batas kanan
  if (x >= b && x <= c)  return 1;          // plateau tengah / full
  if (x < b && b > a)    return (x - a) / (b - a);  // sisi naik
  if (x > c && d > c)    return (d - x) / (d - c);  // sisi turun
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
//  BAGIAN 2: FUZZIFIKASI
// -------------------------------------------------------------

/**
 * Fuzzifikasi Umur Ayam (0–50 hari).
 * Edge case umur = 0: BA = 1 (plateau kiri penuh).
 */
export function fuzzifyAge(age: number): AgeFS {
  return {
    BA: fTrap(age,  0,  0,  5, 10),   // plateau kiri: [0,0] → BA=1 saat age≤5
    BL: fTrap(age,  5, 10, 13, 18),
    T:  fTrap(age, 14, 18, 22, 28),
    PA: fTrap(age, 24, 28, 32, 38),
    PL: fTrap(age, 35, 40, 50, 50),   // plateau kanan: [50,50] → PL=1 saat age≥40
  };
}

/**
 * Fuzzifikasi Error Suhu — FASE BA (Brooding Awal, 0–10 hari).
 * Range: -2.0 °C (sangat panas) hingga +2.0 °C (sangat dingin).
 * e_s = T_setpoint − T_aktual → negatif = aktual lebih panas dari setpoint.
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
 * Range: -1.0 °C (sangat panas) hingga +1.0 °C (sangat dingin).
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
 * Fuzzifikasi Error Kelembaban.
 * Range: -2.5 % (sangat lembap) hingga +2.5 % (sangat kering).
 * e_k = H_setpoint − H_aktual → negatif = aktual lebih lembap dari setpoint.
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
//  BAGIAN 3: RULE BASE
//  25 rules — 5 e_s × 5 e_k
//  Setiap rule output sama untuk semua himpunan umur [BA,BL,T,PA,PL]
//  (umur berperan sebagai moderator bobot via AND, bukan mengubah output)
//
//  Kode output: S=SR, R=R, N=N, T=T, X=ST
//
//  Logika umum:
//  - Dimmer tinggi  → suhu aktual LEBIH PANAS (e_s negatif, NB/NK)
//  - Dimmer rendah  → suhu aktual LEBIH DINGIN (e_s positif, PK/PB)
//  - VFD tinggi     → kelembaban LEBIH KERING (e_k positif, PK/PB)
//                     atau suhu sangat panas (perlu sirkulasi)
//  - VFD rendah     → kondisi ideal / kelembaban lembap + suhu dingin
// -------------------------------------------------------------

export const AGE_KEYS: AgeKey[] = ['BA', 'BL', 'T', 'PA', 'PL'];

const CHAR_TO_KEY: Record<RuleCode, OutputKey> = {
  S: 'SR',
  R: 'R',
  N: 'N',
  T: 'T',
  X: 'ST',
};

/**
 * Rule base: 25 baris [esKey, ekKey, vfd_codes[5], dim_codes[5]]
 * vfd_codes dan dim_codes berlaku untuk [BA, BL, T, PA, PL]
 */
const RULE_TABLE: [EsKey, EkKey, RuleCode[], RuleCode[]][] = [
  // ── e_s = NB (Suhu aktual SANGAT PANAS, perlu pendinginan agresif) ──
  // Dimmer ST (mati/sangat rendah pemanas), VFD sesuai kelembaban
  ['NB', 'NB', ['N','N','N','N','N'], ['X','X','X','X','X']],  // lembap+panas → VFD N, Dimmer ST
  ['NB', 'NK', ['R','R','R','R','R'], ['X','X','X','X','X']],  // agak lembap   → VFD R
  ['NB', 'Z',  ['R','R','R','R','R'], ['X','X','X','X','X']],  // RH ideal      → VFD R
  ['NB', 'PK', ['N','N','N','N','N'], ['X','X','X','X','X']],  // agak kering   → VFD N
  ['NB', 'PB', ['T','T','T','T','T'], ['X','X','X','X','X']],  // sangat kering → VFD T

  // ── e_s = NK (Suhu aktual AGAK PANAS) ──
  ['NK', 'NB', ['N','N','N','N','N'], ['T','T','T','T','T']],
  ['NK', 'NK', ['R','R','R','R','R'], ['T','T','T','T','T']],
  ['NK', 'Z',  ['R','R','R','R','R'], ['T','T','T','T','T']],
  ['NK', 'PK', ['N','N','N','N','N'], ['T','T','T','T','T']],
  ['NK', 'PB', ['T','T','T','T','T'], ['T','T','T','T','T']],

  // ── e_s = Z (Suhu IDEAL) ──
  ['Z',  'NB', ['N','N','N','N','N'], ['S','S','S','S','S']],  // lembap → VFD N, Dimmer SR
  ['Z',  'NK', ['S','S','S','S','S'], ['R','R','R','R','R']],  // agak lembap → VFD SR, Dimmer R
  ['Z',  'Z',  ['S','S','S','S','S'], ['S','S','S','S','S']],  // semua ideal → minimal
  ['Z',  'PK', ['T','T','T','T','T'], ['S','S','S','S','S']],  // agak kering → VFD T
  ['Z',  'PB', ['X','X','X','X','X'], ['S','S','S','S','S']],  // sangat kering → VFD ST

  // ── e_s = PK (Suhu aktual AGAK DINGIN, perlu sedikit pemanasan) ──
  ['PK', 'NB', ['N','N','N','N','N'], ['R','R','R','R','R']],
  ['PK', 'NK', ['T','T','T','T','T'], ['R','R','R','R','R']],
  ['PK', 'Z',  ['T','T','T','T','T'], ['R','R','R','R','R']],
  ['PK', 'PK', ['T','T','T','T','T'], ['R','R','R','R','R']],
  ['PK', 'PB', ['X','X','X','X','X'], ['R','R','R','R','R']],

  // ── e_s = PB (Suhu aktual SANGAT DINGIN, pemanas harus maksimal) ──
  // Dimmer SR (justru kurangi pemanas agar tidak overheat balik)
  // → Catatan: PB berarti T_aktual jauh di bawah setpoint,
  //   pemanas sudah bekerja maksimal, VFD dikurangi agar panas tidak keluar
  ['PB', 'NB', ['N','N','N','N','N'], ['S','S','S','S','S']],
  ['PB', 'NK', ['T','T','T','T','T'], ['S','S','S','S','S']],
  ['PB', 'Z',  ['T','T','T','T','T'], ['S','S','S','S','S']],
  ['PB', 'PK', ['X','X','X','X','X'], ['S','S','S','S','S']],
  ['PB', 'PB', ['X','X','X','X','X'], ['S','S','S','S','S']],
];

// -------------------------------------------------------------
//  BAGIAN 4: INFERENSI (Mamdani — operator AND = min, OR = max)
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
    // Firing strength gabungan e_s dan e_k
    const w = Math.min(t[esKey], h[ekKey]);

    // Bobot akhir per fase umur (AND dengan derajat keanggotaan umur)
    const ageWeights = AGE_KEYS.map((ak) => Math.min(w, a[ak]));

    ruleWeights.push({ esKey, ekKey, w, ageWeights, vCodes, dCodes });

    if (w < 0.001) continue;

    AGE_KEYS.forEach((ak, i) => {
      const aw = ageWeights[i];
      if (aw < 0.001) return;

      const vKey = CHAR_TO_KEY[vCodes[i]];
      const dKey = CHAR_TO_KEY[dCodes[i]];

      // Agregasi: ambil maksimum (union / OR)
      vfd[vKey] = Math.max(vfd[vKey], aw);
      dim[dKey] = Math.max(dim[dKey], aw);
    });
  }

  return { vfd, dim, ruleWeights };
}

// -------------------------------------------------------------
//  BAGIAN 5: DEFUZZIFIKASI — Weighted Average
//  Centroid tiap himpunan output (skala 0–100 %):
//  SR=10, R=30, N=50, T=70, ST=90
// -------------------------------------------------------------

export const OUTPUT_CENTROIDS: Record<OutputKey, number> = {
  SR: 10,
  R:  30,
  N:  50,
  T:  70,
  ST: 90,
};

export function defuzzify(fs: OutputFS): number {
  const num =
    fs.SR * OUTPUT_CENTROIDS.SR +
    fs.R  * OUTPUT_CENTROIDS.R  +
    fs.N  * OUTPUT_CENTROIDS.N  +
    fs.T  * OUTPUT_CENTROIDS.T  +
    fs.ST * OUTPUT_CENTROIDS.ST;
  const den = fs.SR + fs.R + fs.N + fs.T + fs.ST;
  return den > 0.001 ? num / den : 0;
}

// -------------------------------------------------------------
//  HELPER: Tentukan fase umur DOMINAN (derajat keanggotaan tertinggi)
// -------------------------------------------------------------

function getDominantAge(ageMF: AgeFS): AgeKey {
  let maxVal = -1;
  let dominant: AgeKey = 'BA';
  for (const key of AGE_KEYS) {
    if (ageMF[key] > maxVal) {
      maxVal = ageMF[key];
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
 * @param age  Umur ayam dalam hari (0–50)
 * @param es   Error suhu: T_setpoint − T_aktual
 *             BA  (0–10 hari) : kisaran -2.0 .. +2.0 °C
 *             BL–PL (>10 hari): kisaran -1.0 .. +1.0 °C
 * @param ek   Error kelembaban: H_setpoint − H_aktual (-2.5 .. +2.5 %)
 */
export function infer(age: number, es: number, ek: number): FuzzyResult {
  // 1. Fuzzifikasi umur
  const ageMF = fuzzifyAge(age);

  // 2. Tentukan fase dominan → pilih fungsi keanggotaan suhu yang sesuai
  const dominantAge = getDominantAge(ageMF);
  const tempMF = dominantAge === 'BA'
    ? fuzzifyTempBA(es)
    : fuzzifyTempBL(es);

  // 3. Fuzzifikasi kelembaban
  const humMF = fuzzifyHum(ek);

  // 4. Inferensi + agregasi
  const { vfd, dim, ruleWeights } = applyRules(ageMF, tempMF, humMF);

  // 5. Defuzzifikasi (skala 0–100 %)
  const rawVfd = defuzzify(vfd);
  const rawDim = defuzzify(dim);

  // 6. Konversi ke PWM 8-bit (0–255)
  const vfdScore    = Math.round((rawVfd / 100) * 255);
  const dimmerScore = Math.round((rawDim / 100) * 255);

  return {
    vfdScore,
    dimmerScore,
    rawVfd,
    rawDim,
    dominantAge,
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
  NB: 'NB – Suhu Sangat Panas  (e_s sangat negatif)',
  NK: 'NK – Suhu Agak Panas    (e_s sedikit negatif)',
  Z:  'Z  – Suhu Ideal         (e_s ≈ 0)',
  PK: 'PK – Suhu Agak Dingin   (e_s sedikit positif)',
  PB: 'PB – Suhu Sangat Dingin (e_s sangat positif)',
};

export const HUM_LABELS: Record<keyof HumFS, string> = {
  NB: 'NB – Sangat Lembap  (e_k sangat negatif)',
  NK: 'NK – Agak Lembap    (e_k sedikit negatif)',
  Z:  'Z  – RH Ideal       (e_k ≈ 0)',
  PK: 'PK – Agak Kering    (e_k sedikit positif)',
  PB: 'PB – Sangat Kering  (e_k sangat positif)',
};

export const ES_KEYS_ORDERED: EsKey[] = ['NB', 'NK', 'Z', 'PK', 'PB'];
export const EK_KEYS_ORDERED: EkKey[] = ['NB', 'NK', 'Z', 'PK', 'PB'];
