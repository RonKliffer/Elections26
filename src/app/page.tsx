import Dashboard from '@/components/Dashboard';
// Deployment marker: trigger a fresh Vercel deployment on the next push.
export const dynamic = 'force-dynamic';
export default function Home() {
  return <Dashboard />;
}
