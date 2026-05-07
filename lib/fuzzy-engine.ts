// =============================================================
//  fuzzy-engine.ts — Fuzzy Logic Kandang Ayam Broiler
//  Port dari fuzzy.h (Arduino) ke TypeScript (Next.js)
//
//  Input  : age  = umur ayam (hari, 0–50)
//           e_s  = error suhu       = T_setpoint - T_aktual (°C, -10..+10)
//           e_k  = error kelembaban = H_setpoint - H_aktual (%,  -30..+30)
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
  /** Brooding Awal      0–10 hari */
  BA: number;
  /** Brooding Lanjutan  5–18 hari */
  BL: number;
  /** Transisi           14–28 hari */
  T: number;
  /** Pembesaran Awal    24–38 hari */
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
  /** Positif Besar — suhu jauh LEBIH DINGIN */
  PB: number;
}

export interface HumFS {
  /** Negatif Besar — kelembaban jauh LEBIH LEMBAP */
  NB: number;
  /** Negatif Kecil — sedikit lembap */
  NK: number;
  /** Zero — kelembaban ideal */
  Z: number;
  /** Positif Kecil — sedikit kering */
  PK: number;
  /** Positif Besar — jauh LEBIH KERING */
  PB: number;
}

export interface OutputFS {
  /** Sangat Rendah — centroid 10 */
  SR: number;
  /** Rendah — centroid 30 */
  R: number;
  /** Normal — centroid 50 */
  N: number;
  /** Tinggi — centroid 70 */
  T: number;
  /** Sangat Tinggi — centroid 90 */
  ST: number;
}

export type EsKey = 'NB' | 'NK' | 'Z' | 'PK' | 'PB';
export type EkKey = 'NB' | 'NK' | 'Z' | 'PK' | 'PB';
export type AgeKey = 'BA' | 'BL' | 'T' | 'PA' | 'PL';
export type OutputKey = 'SR' | 'R' | 'N' | 'T' | 'ST';
export type RuleCode = 'S' | 'R' | 'N' | 'T' | 'X';

export interface RuleWeight {
  esKey: EsKey;
  ekKey: EkKey;
  /** Bobot AND (min e_s × e_k) */
  w: number;
  /** Bobot per himpunan umur [BA,BL,T,PA,PL] */
  ageWeights: number[];
  /** Kode output VFD per umur */
  vCodes: RuleCode[];
  /** Kode output Dimmer per umur */
  dCodes: RuleCode[];
}

// -------------------------------------------------------------
//  BAGIAN 1: FUNGSI KEANGGOTAAN
// -------------------------------------------------------------

/** Trapesium: naik a→b, datar b→c, turun c→d */
export function fTrap(x: number, a: number, b: number, c: number, d: number): number {
  if (x <= a || x >= d) return 0;
  if (x >= b && x <= c) return 1;
  if (x < b) return (x - a) / (b - a);
  return (d - x) / (d - c);
}

/** Segitiga: naik a→b, turun b→c */
export function fTri(x: number, a: number, b: number, c: number): number {
  if (x <= a || x >= c) return 0;
  if (x === b) return 1;
  if (x < b) return (x - a) / (b - a);
  return (c - x) / (c - b);
}

// -------------------------------------------------------------
//  BAGIAN 2: FUZZIFIKASI
// -------------------------------------------------------------

export function fuzzifyAge(age: number): AgeFS {
  return {
    BA: fTrap(age, 0,  0,  5,  10),
    BL: fTrap(age, 5,  10, 13, 18),
    T:  fTrap(age, 14, 18, 22, 28),
    PA: fTrap(age, 24, 28, 32, 38),
    PL: fTrap(age, 35, 40, 50, 50),
  };
}

export function fuzzifyTemp(es: number): TempFS {
  return {
    NB: fTrap(es, -10, -10, -4, -2),
    NK: fTri(es,   -4,  -2,  0),
    Z:  fTri(es,   -1,   0,  1),
    PK: fTri(es,    0,   2,  4),
    PB: fTrap(es,   2,   4, 10, 10),
  };
}

export function fuzzifyHum(ek: number): HumFS {
  return {
    NB: fTrap(ek, -30, -30, -15, -8),
    NK: fTri(ek,  -12,  -6,   0),
    Z:  fTri(ek,   -3,   0,   3),
    PK: fTri(ek,    0,   6,  12),
    PB: fTrap(ek,   8,  15,  30, 30),
  };
}

// -------------------------------------------------------------
//  BAGIAN 3: RULE BASE
//  25 rules — 5 e_s × 5 e_k, persis sesuai tabel proposal
//  Setiap rule berlaku untuk semua himpunan umur (BA,BL,T,PA,PL)
// -------------------------------------------------------------

const ES_KEYS: EsKey[] = ['NB', 'NK', 'Z', 'PK', 'PB'];
const EK_KEYS: EkKey[] = ['NB', 'NK', 'Z', 'PK', 'PB'];
export const AGE_KEYS: AgeKey[] = ['BA', 'BL', 'T', 'PA', 'PL'];

/** Peta kode rule → kunci OutputFS */
const CHAR_TO_KEY: Record<RuleCode, OutputKey> = {
  S: 'SR',
  R: 'R',
  N: 'N',
  T: 'T',
  X: 'ST',
};

/**
 * Tabel rule base 25 baris.
 * [esKey, ekKey, vfd_codes[BA,BL,T,PA,PL], dim_codes[BA,BL,T,PA,PL]]
 *
 * S=SR, R=R, N=N, T=T, X=ST
 */
const RULE_TABLE: [EsKey, EkKey, RuleCode[], RuleCode[]][] = [
  // --- e_s = NB (Suhu Sangat Panas) ---
  ['NB', 'NB', ['N','N','N','N','N'], ['X','X','X','X','X']],
  ['NB', 'NK', ['R','R','R','R','R'], ['X','X','X','X','X']],
  ['NB', 'Z',  ['R','R','R','R','R'], ['X','X','X','X','X']],
  ['NB', 'PK', ['N','N','N','N','N'], ['X','X','X','X','X']],
  ['NB', 'PB', ['T','T','T','T','T'], ['X','X','X','X','X']],
  // --- e_s = NK (Suhu Sedikit Panas) ---
  ['NK', 'NB', ['N','N','N','N','N'], ['T','T','T','T','T']],
  ['NK', 'NK', ['R','R','R','R','R'], ['T','T','T','T','T']],
  ['NK', 'Z',  ['R','R','R','R','R'], ['T','T','T','T','T']],
  ['NK', 'PK', ['N','N','N','N','N'], ['T','T','T','T','T']],
  ['NK', 'PB', ['T','T','T','T','T'], ['T','T','T','T','T']],
  // --- e_s = Z (Suhu Ideal) ---
  ['Z',  'NB', ['N','N','N','N','N'], ['S','S','S','S','S']],
  ['Z',  'NK', ['S','S','S','S','S'], ['R','R','R','R','R']],
  ['Z',  'Z',  ['S','S','S','S','S'], ['S','S','S','S','S']],
  ['Z',  'PK', ['T','T','T','T','T'], ['S','S','S','S','S']],
  ['Z',  'PB', ['X','X','X','X','X'], ['S','S','S','S','S']],
  // --- e_s = PK (Suhu Sedikit Dingin) ---
  ['PK', 'NB', ['N','N','N','N','N'], ['R','R','R','R','R']],
  ['PK', 'NK', ['T','T','T','T','T'], ['R','R','R','R','R']],
  ['PK', 'Z',  ['T','T','T','T','T'], ['R','R','R','R','R']],
  ['PK', 'PK', ['T','T','T','T','T'], ['R','R','R','R','R']],
  ['PK', 'PB', ['X','X','X','X','X'], ['R','R','R','R','R']],
  // --- e_s = PB (Suhu Sangat Dingin) ---
  ['PB', 'NB', ['N','N','N','N','N'], ['S','S','S','S','S']],
  ['PB', 'NK', ['T','T','T','T','T'], ['S','S','S','S','S']],
  ['PB', 'Z',  ['T','T','T','T','T'], ['S','S','S','S','S']],
  ['PB', 'PK', ['X','X','X','X','X'], ['S','S','S','S','S']],
  ['PB', 'PB', ['X','X','X','X','X'], ['S','S','S','S','S']],
];

// -------------------------------------------------------------
//  BAGIAN 4: INFERENSI
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
    const w = Math.min(t[esKey], h[ekKey]);
    const ageWeights = AGE_KEYS.map((ak) => Math.min(w, a[ak]));

    ruleWeights.push({ esKey, ekKey, w, ageWeights, vCodes, dCodes });

    if (w < 0.001) continue;

    AGE_KEYS.forEach((ak, i) => {
      const aw = ageWeights[i];
      if (aw < 0.001) return;

      const vKey = CHAR_TO_KEY[vCodes[i]];
      const dKey = CHAR_TO_KEY[dCodes[i]];
      vfd[vKey] = Math.max(vfd[vKey], aw);
      dim[dKey] = Math.max(dim[dKey], aw);
    });
  }

  return { vfd, dim, ruleWeights };
}

// -------------------------------------------------------------
//  BAGIAN 5: DEFUZZIFIKASI — Weighted Average (Centroid)
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
//  FUNGSI UTAMA
// -------------------------------------------------------------

/**
 * Hitung output fuzzy Mamdani untuk kandang ayam broiler.
 *
 * @param age  Umur ayam dalam hari (0–50)
 * @param es   Error suhu: T_setpoint − T_aktual (−10 sampai +10 °C)
 * @param ek   Error kelembaban: H_setpoint − H_aktual (−30 sampai +30 %)
 */
export function infer(age: number, es: number, ek: number): FuzzyResult {
  // 1. Fuzzifikasi
  const ageMF  = fuzzifyAge(age);
  const tempMF = fuzzifyTemp(es);
  const humMF  = fuzzifyHum(ek);

  // 2. Inferensi + agregasi
  const { vfd, dim, ruleWeights } = applyRules(ageMF, tempMF, humMF);

  // 3. Defuzzifikasi (skala 0–100)
  const rawVfd = defuzzify(vfd);
  const rawDim = defuzzify(dim);

  // 4. Konversi ke PWM 8-bit (0–255)
  const vfdScore    = (rawVfd / 100) * 255;
  const dimmerScore = (rawDim / 100) * 255;

  return {
    vfdScore,
    dimmerScore,
    rawVfd,
    rawDim,
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
  R:  'R – Rendah',
  N:  'N – Normal',
  T:  'T – Tinggi',
  ST: 'ST – Sangat Tinggi',
};

export const AGE_LABELS: Record<AgeKey, string> = {
  BA: 'BA – Brooding Awal',
  BL: 'BL – Brooding Lanjutan',
  T:  'T – Transisi',
  PA: 'PA – Pembesaran Awal',
  PL: 'PL – Pembesaran Lanjutan',
};

export const TEMP_LABELS: Record<keyof TempFS, string> = {
  NB: 'NB – Sangat Panas',
  NK: 'NK – Agak Panas',
  Z:  'Z – Ideal',
  PK: 'PK – Agak Dingin',
  PB: 'PB – Sangat Dingin',
};

export const HUM_LABELS: Record<keyof HumFS, string> = {
  NB: 'NB – Sangat Lembap',
  NK: 'NK – Agak Lembap',
  Z:  'Z – Ideal',
  PK: 'PK – Agak Kering',
  PB: 'PB – Sangat Kering',
};

export const ES_KEYS_ORDERED: EsKey[] = ['NB', 'NK', 'Z', 'PK', 'PB'];
export const EK_KEYS_ORDERED: EkKey[] = ['NB', 'NK', 'Z', 'PK', 'PB'];
