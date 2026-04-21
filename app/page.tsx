import { FuzzySimulator } from '@/components/simulator/FuzzySimulator';

export const metadata = {
  title: 'Fuzzy Logic Simulator — LIDAR · MPU6050 · Throttle',
  description: 'Mamdani fuzzy inference system: LIDAR distance, slope (MPU6050), and speed error → throttle PWM output.',
};

export default function SimulatorPage() {
  return <FuzzySimulator />;
}