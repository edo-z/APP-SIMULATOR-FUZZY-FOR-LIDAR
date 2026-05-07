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
User geser slider (age, es, ek)
        ↓
FuzzySimulator.tsx
  └── useMemo → infer(age, es, ek)   [dari lib/fuzzy-engine.ts]
        ↓
  Fuzzifikasi
    fuzzifyAge(age)   → AgeFS  {BA, BL, T, PA, PL}
    fuzzifyTemp(es)   → TempFS {NB, NK, Z, PK, PB}
    fuzzifyHum(ek)    → HumFS  {NB, NK, Z, PK, PB}
        ↓
  Rule Evaluation (25 rules)
    AND = min(t[esKey], h[ekKey])
    Bobot umur = min(w, a[ageKey])
        ↓
  Agregasi MAX → OutputFS {SR, R, N, T, ST}
        ↓
  Defuzzifikasi (centroid weighted average)
    rawVfd, rawDim  ∈ [0, 100]
        ↓
  Konversi PWM: (raw / 100) × 255
        ↓
FuzzyResult → props ke semua komponen UI
```

---

## Kustomisasi Rule Base

Buka `lib/fuzzy-engine.ts`, cari `RULE_TABLE`.
Setiap baris adalah satu kombinasi `[e_s, e_k]`:

```ts
// Format:
// [esKey, ekKey, vfd_per_umur[BA,BL,T,PA,PL], dim_per_umur[BA,BL,T,PA,PL]]
// Kode: S=SR, R=Rendah, N=Normal, T=Tinggi, X=ST

['NB', 'NB', ['N','N','N','N','N'], ['X','X','X','X','X']],
//  ↑ suhu sangat panas, kelembaban sangat lembap
//  VFD Normal untuk semua fase umur
//  Dimmer Sangat Tinggi untuk semua fase umur
```

Jika rule berbeda per fase umur, ganti kode di array:
```ts
['PK', 'PB', ['T','X','X','X','X'], ['R','R','R','S','S']],
//            ↑ BA=T  BL=X  T=X  PA=X  PL=X
//                         Dimmer: BA=R  ...  PL=S
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

Nilai `vfdScore` dan `dimmerScore` langsung siap dikirim ke hardware:

```ts
const result = infer(age, es, ek);

// Kirim via API route ke MQTT / Serial
await fetch('/api/control', {
  method: 'POST',
  body: JSON.stringify({
    pwm_vfd:    Math.round(result.vfdScore),    // 0–255
    pwm_dimmer: Math.round(result.dimmerScore), // 0–255
  }),
});
```