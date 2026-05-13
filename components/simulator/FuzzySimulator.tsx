'use client';

// components/simulator/FuzzySimulator.tsx
import { useState, useMemo } from 'react';
import { infer, AGE_KEYS } from '@/lib/fuzzy-engine';
import MetricCard from './MetricCard';
import MembershipPanel from './MembershipPanel';
import OutputPanel from './OutputPanel';
import RuleTable from './RuleTable';

const AGE_PHASE_LABELS: Record<string, string> = {
  BA: 'Brooding Awal',
  BL: 'Brooding Lanjutan',
  T:  'Transisi',
  PA: 'Pembesaran Awal',
  PL: 'Pembesaran Lanjutan',
};

function SliderInput({
  label,
  sublabel,
  id,
  min,
  max,
  step,
  value,
  unit,
  onChange,
}: {
  label: string;
  sublabel?: string;
  id: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={id} className="text-sm text-neutral-700 dark:text-neutral-300">
          {label}
        </label>
        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {value.toFixed(step < 1 ? 1 : 0)} {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-blue-600"
      />
      {sublabel && (
        <p className="text-[10px] text-neutral-400 mt-0.5">{sublabel}</p>
      )}
    </div>
  );
}

export default function FuzzySimulator() {
  const [age, setAge] = useState(7);
  const [tempAct, setTempAct] = useState(32.5);
  const [humAct, setHumAct] = useState(62.5);

  const result = useMemo(() => infer(age, tempAct, humAct), [age, tempAct, humAct]);

  const pwmVfd = Math.round(result.vfdScore);
  const pwmDim = Math.round(result.dimmerScore);

  const dominantAge = result.dominantAge;
  const setpoint = result.setpoint;
  const error = result.error;

  const esDesc =
    error.es < -0.5 ? 'Terlalu dingin' : error.es > 0.5 ? 'Terlalu panas' : 'Suhu ideal';
  const ekDesc =
    error.ek < -3 ? 'Terlalu lembap' : error.ek > 3 ? 'Terlalu kering' : 'Kelembaban ideal';

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-medium text-neutral-900 dark:text-neutral-100">
          Fuzzy Mamdani — Kandang Ayam Broiler
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Kendali VFD kipas &amp; AC Dimmer pemanas — input: umur, suhu aktual, RH aktual
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="PWM VFD" value={pwmVfd} unit="0–255" accent="blue" />
        <MetricCard label="VFD %" value={Math.round(result.rawVfd)} unit="persen" accent="teal" />
        <MetricCard label="PWM Dimmer" value={pwmDim} unit="0–255" accent="amber" />
        <MetricCard label="Dimmer %" value={Math.round(result.rawDim)} unit="persen" accent="coral" />
      </div>

      {/* Controls + Membership */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Controls */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-5">
          <p className="text-[11px] font-medium text-neutral-400 tracking-widest uppercase mb-4">
            Input Kendali
          </p>

          <SliderInput
            label="Umur Ayam"
            id="sl-age"
            min={0} max={50} step={1}
            value={age} unit="hari"
            onChange={setAge}
          />

          {/* Age phase badges */}
          <div className="flex flex-wrap gap-1.5 mb-5">
            {AGE_KEYS.map((k) => {
              const deg = result.membership.age[k];
              const active = deg > 0.01;
              return (
                <span
                  key={k}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                    active
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-600'
                  }`}
                >
                  {k} {active ? `(${deg.toFixed(2)})` : ''}
                </span>
              );
            })}
          </div>

          <hr className="border-neutral-200 dark:border-neutral-700 mb-4" />

          <SliderInput
            label="Suhu Aktual"
            sublabel="Sensor suhu aktual (°C)"
            id="sl-temp"
            min={20} max={40} step={0.1}
            value={tempAct} unit="°C"
            onChange={setTempAct}
          />

          <SliderInput
            label="Kelembaban Aktual"
            sublabel="Sensor RH aktual (%)"
            id="sl-hum"
            min={40} max={80} step={0.5}
            value={humAct} unit="%"
            onChange={setHumAct}
          />

          {/* Status */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 bg-neutral-50 dark:bg-neutral-800 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <span className="text-[11px] text-neutral-500">
              Fase: <strong className="text-neutral-700 dark:text-neutral-300">
                {AGE_PHASE_LABELS[dominantAge]}
              </strong>
              &nbsp;·&nbsp;{esDesc}&nbsp;·&nbsp;{ekDesc}
            </span>
            <span className="text-[10px] text-neutral-400">
              Setpoint: {setpoint.temp.toFixed(1)}°C / {setpoint.hum.toFixed(1)}%
            </span>
            <span className="text-[10px] text-neutral-400">
              Error: e_s={error.es.toFixed(2)}, e_k={error.ek.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Membership Degrees */}
        <MembershipPanel
          age={result.membership.age}
          temp={result.membership.temp}
          hum={result.membership.hum}
          dominantAge={dominantAge}
          setpoint={setpoint}
          error={error}
        />
      </div>

      {/* Output Panel */}
      <OutputPanel
        vfd={result.output.vfd}
        dim={result.output.dim}
        rawVfd={result.rawVfd}
        rawDim={result.rawDim}
        pwmVfd={pwmVfd}
        pwmDim={pwmDim}
      />

      {/* Rule Table */}
      <RuleTable ruleWeights={result.ruleWeights} />
    </div>
  );
}
