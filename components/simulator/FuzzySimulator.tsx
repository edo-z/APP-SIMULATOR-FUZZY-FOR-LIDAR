'use client';

import { useState, useMemo } from 'react';
import {
  infer,
  fuzzifyLidar,
  fuzzifySlope,
  fuzzifyErrorVelocity,
  type ThrottleLabel,
  type InferenceResult,
} from '@/lib/fuzzy-engine';
import { MembershipPanel } from './MembershipPanel';
import { RuleTable } from './RuleTable';
import { OutputPanel } from './OutputPanel';
import { MetricCard } from './MetricCard';

type TabId = 'lidar' | 'slope' | 'ev' | 'output';

export function FuzzySimulator() {
  const [lidar,    setLidar]    = useState(80);
  const [slope,    setSlope]    = useState(0);
  const [errorVel, setErrorVel] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>('lidar');

  const result: InferenceResult = useMemo(
    () => infer(lidar, slope, errorVel),
    [lidar, slope, errorVel],
  );

  const lidarMem  = useMemo(() => fuzzifyLidar(lidar),           [lidar]);
  const slopeMem  = useMemo(() => fuzzifySlope(slope),           [slope]);
  const evMem     = useMemo(() => fuzzifyErrorVelocity(errorVel),[errorVel]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'lidar',  label: 'LIDAR' },
    { id: 'slope',  label: 'Kemiringan' },
    { id: 'ev',     label: 'Error Kecepatan' },
    { id: 'output', label: 'Output Fuzzy' },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-monsterrat">

      {/* Header */}
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs tracking-[0.2em] uppercase text-neutral-400">
          Fuzzy Logic Controller
        </span>
        <span className="ml-auto text-xs text-neutral-600">
          LIDAR · MPU6050 · Throttle
        </span>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Input sliders */}
        <section>
          <p className="text-[10px] tracking-widest uppercase text-neutral-500 mb-4">
            Parameter Input
          </p>
          <div className="space-y-3">
            <SliderRow
              label="LIDAR — Jarak"
              unit="cm"
              min={0} max={300} step={1}
              value={lidar}
              onChange={setLidar}
              color="text-red-400"
            />
            <SliderRow
              label="Kemiringan MPU6050"
              unit="°"
              min={-30} max={30} step={0.5}
              value={slope}
              onChange={setSlope}
              color="text-violet-400"
            />
            <SliderRow
              label="Error Kecepatan"
              unit="km/h"
              min={-20} max={20} step={0.5}
              value={errorVel}
              onChange={setErrorVel}
              color="text-amber-400"
            />
          </div>
        </section>

        {/* Output metric cards */}
        <section className="grid grid-cols-2 gap-3">
          <MetricCard
            label="Output Throttle"
            value={result.throttlePwm}
            sub="PWM 0–255"
            pct={(result.throttlePwm / 255) * 100}
            barColor="bg-sky-500"
          />
          <MetricCard
            label="Throttle"
            value={`${Math.round(result.throttlePct)}%`}
            sub="Persentase 0–100%"
            pct={result.throttlePct}
            barColor="bg-emerald-500"
          />
        </section>

        {/* Membership tabs */}
        <section>
          <p className="text-[10px] tracking-widest uppercase text-neutral-500 mb-3">
            Derajat Keanggotaan Input
          </p>

          {/* Tab buttons */}
          <div className="flex gap-2 flex-wrap mb-4">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={[
                  'px-3 py-1 text-[11px] tracking-wide border rounded transition-colors',
                  activeTab === t.id
                    ? 'bg-neutral-800 border-neutral-600 text-neutral-100'
                    : 'border-neutral-700 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'lidar' && (
            <MembershipPanel
              items={[
                { label: 'Very Close (0–60 cm)',   value: lidarMem.VC, color: '#ef4444' },
                { label: 'Close (30–120 cm)',       value: lidarMem.C,  color: '#f97316' },
                { label: 'Medium (80–180 cm)',      value: lidarMem.M,  color: '#10b981' },
                { label: 'Far (150–300 cm)',        value: lidarMem.F,  color: '#3b82f6' },
              ]}
            />
          )}
          {activeTab === 'slope' && (
            <MembershipPanel
              items={[
                { label: 'Down Hill (turun)',  value: slopeMem.DH, color: '#8b5cf6' },
                { label: 'Flat (datar)',       value: slopeMem.FL, color: '#10b981' },
                { label: 'Up Hill (naik)',     value: slopeMem.UH, color: '#f59e0b' },
              ]}
            />
          )}
          {activeTab === 'ev' && (
            <MembershipPanel
              items={[
                { label: 'NB — terlalu lambat', value: evMem.NB, color: '#8b5cf6' },
                { label: 'ZO — ideal',          value: evMem.ZO, color: '#10b981' },
                { label: 'PS — terlalu cepat',  value: evMem.PS, color: '#f59e0b' },
              ]}
            />
          )}
          {activeTab === 'output' && (
            <OutputPanel fuzzy={result.throttleFuzzy} />
          )}
        </section>

        {/* Rule table */}
        <section>
          <p className="text-[10px] tracking-widest uppercase text-neutral-500 mb-3">
            Rule Base — 36 Rule Aktif
          </p>
          <RuleTable rules={result.firedRules} />
        </section>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline sub-component: SliderRow
// ---------------------------------------------------------------------------

interface SliderRowProps {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  color: string;
}

function SliderRow({ label, unit, min, max, step, value, onChange, color }: SliderRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-neutral-400 w-44 shrink-0">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-neutral-400"
      />
      <span className={`text-[12px] font-medium w-20 text-right ${color}`}>
        {Number.isInteger(step) ? value : value.toFixed(1)} {unit}
      </span>
    </div>
  );
}
