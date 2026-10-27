import { resultsResponse } from '@/lib/server/results-response';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  // Compare the public Host rather than the internal HTTP protocol so that a
  // normal HTTPS reverse proxy can serve the persistent Node process.
  if (origin && new URL(origin).host !== (request.headers.get('host') ?? new URL(request.url).host))
    return Response.json({ error: 'Origin not allowed' }, { status: 403 });
  return resultsResponse();
}
