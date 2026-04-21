# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this codebase.

## Project Overview

Simulator interaktif untuk sistem kendali fuzzy Mamdani yang menghitung output throttle PWM berdasarkan tiga input:
1. **LIDAR** — Jarak halangan (0–300 cm)
2. **MPU6050** — Kemiringan/slope (-30° sampai +30°)
3. **Error Velocity** — Selisih kecepatan aktual vs target (-20 sampai +20 km/h)

Output throttle dikonversi ke PWM 0–255 untuk kontrol motor.

## Development Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Tech Stack

- **Framework**: Next.js 16.2.3 (App Router)
- **React**: 19.2.4
- **Styling**: Tailwind CSS 4
- **TypeScript**: Strict mode enabled
- **Path alias**: `@/*` maps to `./*`

## Architecture

### Fuzzy Engine (`lib/fuzzy-engine.ts`)

Implementasi Mamdani fuzzy inference system:

**Membership Functions:**
- LIDAR: Trapezoid/Triangle (VC, C, M, F)
- Slope: Trapezoid/Triangle (DH, FL, UH)
- Error Velocity: Trapezoid/Triangle (NB, ZO, PS)
- Throttle Output: Centroid (VL=10%, L=30%, M=50%, H=70%, VH=90%)

**Rule Base:** 36 rules (4 LIDAR × 3 Slope × 3 Error Velocity)

**Defuzzification:** Centroid method → persentase → PWM (0–255)

### UI Components (`components/simulator/`)

| Component | Fungsi |
|----------|--------|
| `FuzzySimulator.tsx` | Main orchestrator, state management untuk input sliders |
| `MembershipPanel.tsx` | Progress bar untuk derajat keanggotaan input |
| `OutputPanel.tsx` | Progress bar untuk output throttle fuzzy |
| `RuleTable.tsx` | Tabel 36 rule dengan highlight rule aktif |
| `MetricCard.tsx` | Card untuk output PWM dan persentase |

### Data Flow

1. User menggeser slider LIDAR, Slope, Error Velocity
2. `useMemo` memanggil `infer()` dari fuzzy-engine
3. Fuzzification → Rule evaluation → Aggregation → Defuzzification
4. UI update menampilkan membership degrees, fired rules, dan output throttle