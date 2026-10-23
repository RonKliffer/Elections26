import { getElectionService } from '@/lib/server/runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const service = getElectionService();
  await service.start();
  return Response.json(service.getState(), { headers: { 'Cache-Control': 'no-store' } });
}
