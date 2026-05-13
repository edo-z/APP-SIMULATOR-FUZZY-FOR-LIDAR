# Integrasi Fuzzy Broiler ke Next.js

## Struktur File

```
your-project/
├── lib/
│   └── fuzzy-engine.ts          ← Port lengkap dari fuzzy.h
│
├── components/
│   └── simulator/
│       ├── FuzzySimulator.tsx   ← Orchestrator + state sliders
│       ├── MembershipPanel.tsx  ← Progress bar derajat keanggotaan input
│       ├── MembershipBar.tsx    ← Sub-komponen satu bar
│       ├── OutputPanel.tsx      ← Output VFD & Dimmer fuzzy
│       ├── RuleTable.tsx        ← Tabel 25 rule dengan highlight
│       └── MetricCard.tsx       ← Card angka PWM / persen
│
└── app/
    └── page.tsx                 ← Pasang FuzzySimulator di sini
```

## Langkah Instalasi

### 1. Copy file-file di atas ke project

Salin sesuai struktur di atas. Tidak ada package tambahan yang diperlukan —
hanya React + TypeScript + Tailwind CSS yang sudah ada di setup Anda.

### 2. Pastikan path alias `@/*` sudah aktif

Di `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### 3. Jalankan

```bash
npm run dev
```

Buka `http://localhost:3000` — simulator langsung berjalan.

---

## Data Flow

```
User geser slider (age, tempAct, humAct)
        ↓
FuzzySimulator.tsx
  └── useMemo → infer(age, tempAct, humAct)   [lib/fuzzy-engine.ts]
        ↓
  [Engine internal]
  1. fuzzifyAge(age)           → AgeFS  {BA, BL, T, PA, PL}
  2. getDominantAge(ageMF)     → AgeKey (fase dominan)
  3. SETPOINT_TABLE[dominant]  → { temp, hum }
  4. es = setpoint.temp - tempAct
     ek = setpoint.hum  - humAct
  5. dominantAge === 'BA'
       ? fuzzifyTempBA(es)     → TempFS (range ±2.0°C)
       : fuzzifyTempBL(es)     → TempFS (range ±1.0°C)
  6. fuzzifyHum(ek)            → HumFS  (range ±2.5%)
        ↓
  Rule Evaluation (25 rules × 5 fase umur)
    w         = min(t[esKey], h[ekKey])
    ageWeight = min(w, a[ageKey])
        ↓
  Agregasi MAX → OutputFS {SR, R, N, T, ST}
        ↓
  Defuzzifikasi (weighted average, centroid SR=10 R=30 N=50 T=70 ST=90)
    rawVfd, rawDim  ∈ [0, 100]
        ↓
  Konversi PWM: Math.round((raw / 100) × 255)
        ↓
FuzzyResult → { vfdScore, dimmerScore, dominantAge, setpoint, error, ... }
              → props ke semua komponen UI
```

---

## Kustomisasi Rule Base

Buka `lib/fuzzy-engine.ts`, cari `RULE_TABLE`.

```ts
// Format: [esKey, ekKey, vfd_codes[BA,BL,T,PA,PL], dim_codes[BA,BL,T,PA,PL]]
// Kode: S=SR, R=Rendah, N=Normal, T=Tinggi, X=ST
```

**Output rule SERAGAM untuk semua fase umur.** Fase umur hanya memoderasi BOBOT via AND, bukan mengubah output.

```ts
['NB', 'NB', ['N','N','N','N','N'], ['X','X','X','X','X']],
//  ↑ suhu sangat panas + RH sangat lembap
//  VFD = Normal untuk semua fase
//  Dimmer = Sangat Tinggi untuk semua fase
//  Bobot akhir tiap fase = min(w, µ_age[fase])
```

---

## Menambah Membership Function Baru

Di `lib/fuzzy-engine.ts`:

```ts
// Tambah anggota ke interface, misal AgeFS
export interface AgeFS {
  BA: number;
  BL: number;
  T:  number;
  PA: number;
  PL: number;
  DW: number; // ← fase baru "Dewasa"
}

// Update fuzzifyAge()
export function fuzzifyAge(age: number): AgeFS {
  return {
    ...
    DW: fTrap(age, 45, 48, 60, 60), // ← tambah
  };
}
```

Lalu tambah kode di `AGE_KEYS`, `AGE_LABELS`, dan update RULE_TABLE.

---

## Menggunakan Output di Hardware

Kirim nilai aktual sensor ke engine, bukan error:

```ts
// BARU — kirim nilai aktual sensor, bukan error
const result = infer(age, tempAktual, humAktual);

// result.setpoint → setpoint yang digunakan
// result.error    → { es, ek } yang dihitung engine
// result.dominantAge → fase umur aktif

await fetch('/api/control', {
  method: 'POST',
  body: JSON.stringify({
    pwm_vfd:       result.vfdScore,      // 0–255
    pwm_dimmer:    result.dimmerScore,   // 0–255
    dominant_age:  result.dominantAge,
    setpoint_temp: result.setpoint.temp,
    setpoint_hum: result.setpoint.hum,
    error_suhu:    result.error.es,
    error_rh:      result.error.ek,
  }),
});
```