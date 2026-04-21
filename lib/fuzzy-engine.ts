// ---------------------------------------------------------------------------
// Membership functions
// ---------------------------------------------------------------------------

function trapezoid(x: number, a: number, b: number, c: number, d: number): number {
  if (x <= a || x >= d) return 0;
  if (x >= b && x <= c) return 1;
  if (x < b) return (x - a) / (b - a);
  return (d - x) / (d - c);
}

function triangle(x: number, a: number, b: number, c: number): number {
  if (x <= a || x >= c) return 0;
  if (x === b) return 1;
  if (x < b) return (x - a) / (b - a);
  return (c - x) / (c - b);
}

// ---------------------------------------------------------------------------
// Input membership sets
// ---------------------------------------------------------------------------

export interface LidarMembership {
  VC: number; // Very Close
  C: number;  // Close
  M: number;  // Medium
  F: number;  // Far
}

export interface SlopeMembership {
  DH: number; // Down Hill
  FL: number; // Flat
  UH: number; // Up Hill
}

export interface ErrorVelocityMembership {
  NB: number; // Negative Big  (terlalu lambat)
  ZO: number; // Zero          (ideal)
  PS: number; // Positive Small (terlalu cepat)
}

export interface ThrottleMembership {
  VL: number; // Very Low
  L: number;  // Low
  M: number;  // Medium
  H: number;  // High
  VH: number; // Very High
}

export type ThrottleLabel = keyof ThrottleMembership;

// ---------------------------------------------------------------------------
// Fuzzification
// ---------------------------------------------------------------------------

export function fuzzifyLidar(x: number): LidarMembership {
  return {
    VC: trapezoid(x, 0,   0,  30,  60),
    C:  triangle (x, 30,  60, 120),
    M:  triangle (x, 80,  130, 180),
    F:  trapezoid(x, 150, 200, 300, 300),
  };
}

export function fuzzifySlope(x: number): SlopeMembership {
  return {
    DH: trapezoid(x, -30, -30, -10, -3),
    FL: triangle (x, -8,  0,   8),
    UH: trapezoid(x,  3,  10,  30, 30),
  };
}

export function fuzzifyErrorVelocity(x: number): ErrorVelocityMembership {
  return {
    NB: trapezoid(x, -20, -20, -8, -3),
    ZO: triangle (x, -5,  0,   5),
    PS: trapezoid(x,  3,  8,   20, 20),
  };
}

// ---------------------------------------------------------------------------
// Rule base  (36 rules: 4 LIDAR × 3 Slope × 3 Error Velocity)
// ---------------------------------------------------------------------------

type LidarKey = keyof LidarMembership;
type SlopeKey = keyof SlopeMembership;
type EvKey    = keyof ErrorVelocityMembership;

export interface Rule {
  lidar:  LidarKey;
  slope:  SlopeKey;
  ev:     EvKey;
  output: ThrottleLabel;
}

export interface FiredRule extends Rule {
  weight: number;
  active: boolean;
}

export const RULE_BASE: Rule[] = [
  // Very Close → always Very Low regardless of slope / speed error
  { lidar:'VC', slope:'DH', ev:'NB', output:'VL' },
  { lidar:'VC', slope:'DH', ev:'ZO', output:'VL' },
  { lidar:'VC', slope:'DH', ev:'PS', output:'VL' },
  { lidar:'VC', slope:'FL', ev:'NB', output:'VL' },
  { lidar:'VC', slope:'FL', ev:'ZO', output:'VL' },
  { lidar:'VC', slope:'FL', ev:'PS', output:'VL' },
  { lidar:'VC', slope:'UH', ev:'NB', output:'VL' },
  { lidar:'VC', slope:'UH', ev:'ZO', output:'VL' },
  { lidar:'VC', slope:'UH', ev:'PS', output:'VL' },

  // Close
  { lidar:'C', slope:'DH', ev:'NB', output:'VL' },
  { lidar:'C', slope:'DH', ev:'ZO', output:'VL' },
  { lidar:'C', slope:'DH', ev:'PS', output:'L'  },
  { lidar:'C', slope:'FL', ev:'NB', output:'VL' },
  { lidar:'C', slope:'FL', ev:'ZO', output:'L'  },
  { lidar:'C', slope:'FL', ev:'PS', output:'M'  },
  { lidar:'C', slope:'UH', ev:'NB', output:'L'  },
  { lidar:'C', slope:'UH', ev:'ZO', output:'M'  },
  { lidar:'C', slope:'UH', ev:'PS', output:'H'  },

  // Medium
  { lidar:'M', slope:'DH', ev:'NB', output:'VL' },
  { lidar:'M', slope:'DH', ev:'ZO', output:'L'  },
  { lidar:'M', slope:'DH', ev:'PS', output:'L'  },
  { lidar:'M', slope:'FL', ev:'NB', output:'L'  },
  { lidar:'M', slope:'FL', ev:'ZO', output:'M'  },
  { lidar:'M', slope:'FL', ev:'PS', output:'H'  },
  { lidar:'M', slope:'UH', ev:'NB', output:'M'  },
  { lidar:'M', slope:'UH', ev:'ZO', output:'H'  },
  { lidar:'M', slope:'UH', ev:'PS', output:'VH' },

  // Far
  { lidar:'F', slope:'DH', ev:'NB', output:'L'  },
  { lidar:'F', slope:'DH', ev:'ZO', output:'L'  },
  { lidar:'F', slope:'DH', ev:'PS', output:'M'  },
  { lidar:'F', slope:'FL', ev:'NB', output:'L'  },
  { lidar:'F', slope:'FL', ev:'ZO', output:'M'  },
  { lidar:'F', slope:'FL', ev:'PS', output:'H'  },
  { lidar:'F', slope:'UH', ev:'NB', output:'M'  },
  { lidar:'F', slope:'UH', ev:'ZO', output:'H'  },
  { lidar:'F', slope:'UH', ev:'PS', output:'VH' },
];

// ---------------------------------------------------------------------------
// Centroid values for defuzzification
// ---------------------------------------------------------------------------

export const CENTROIDS: Record<ThrottleLabel, number> = {
  VL: 10,
  L:  30,
  M:  50,
  H:  70,
  VH: 90,
};

// ---------------------------------------------------------------------------
// Inference & defuzzification
// ---------------------------------------------------------------------------

export interface InferenceResult {
  firedRules:   FiredRule[];
  throttleFuzzy: ThrottleMembership;
  throttlePct:  number; // 0–100
  throttlePwm:  number; // 0–255
}

export function infer(
  lidarCm:    number,
  slopeDeg:   number,
  errorVelocity: number,
): InferenceResult {
  const L = fuzzifyLidar(lidarCm);
  const S = fuzzifySlope(slopeDeg);
  const E = fuzzifyErrorVelocity(errorVelocity);

  const throttleFuzzy: ThrottleMembership = { VL: 0, L: 0, M: 0, H: 0, VH: 0 };

  const firedRules: FiredRule[] = RULE_BASE.map((rule) => {
    const weight = Math.min(L[rule.lidar], S[rule.slope], E[rule.ev]);
    if (weight > 0.001) {
      throttleFuzzy[rule.output] = Math.max(throttleFuzzy[rule.output], weight);
    }
    return { ...rule, weight, active: weight > 0.005 };
  });

  // Centroid defuzzification
  let num = 0, den = 0;
  for (const k of Object.keys(throttleFuzzy) as ThrottleLabel[]) {
    num += throttleFuzzy[k] * CENTROIDS[k];
    den += throttleFuzzy[k];
  }
  const throttlePct = den > 0.001 ? num / den : 50;
  const throttlePwm = Math.round((throttlePct / 100) * 255);

  return { firedRules, throttleFuzzy, throttlePct, throttlePwm };
}
