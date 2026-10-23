import { getElectionService } from '@/lib/server/runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  // Compare the public Host rather than the internal HTTP protocol so that a
  // normal HTTPS reverse proxy can serve the persistent Node process.
  if (origin && new URL(origin).host !== (request.headers.get('host') ?? new URL(request.url).host))
    return Response.json({ error: 'Origin not allowed' }, { status: 403 });
  const service = getElectionService();
  await service.start();
  await service.refresh(true);
  return Response.json(service.getState(), { headers: { 'Cache-Control': 'no-store' } });
}
