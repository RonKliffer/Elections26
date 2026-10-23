import { getElectionService } from '@/lib/server/runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET() {
  const service = getElectionService();
  await service.refresh();
  return Response.json(service.getState(), { headers: { 'Cache-Control': 'no-store' } });
}
