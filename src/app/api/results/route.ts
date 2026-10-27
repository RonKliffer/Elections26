import { resultsResponse } from '@/lib/server/results-response';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET() {
  return resultsResponse();
}
