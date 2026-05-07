// app/page.tsx  (atau app/simulator/page.tsx jika ingin di subroute)
import FuzzySimulator from '@/components/simulator/FuzzySimulator';

export const metadata = {
  title: 'Fuzzy Mamdani — Kandang Ayam Broiler',
  description: 'Simulator kendali fuzzy VFD kipas dan AC Dimmer pemanas kandang ayam broiler',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <FuzzySimulator />
    </main>
  );
}