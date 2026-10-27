import { getElectionService } from './runtime';

export async function resultsResponse(): Promise<Response> {
  try {
    const service = getElectionService();
    await service.refresh();
    return Response.json(service.getState(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Results service initialization or response failed:', error);
    return Response.json(
      {
        error: 'שירות התוצאות לא הצליח לפעול. יש לבדוק את הגדרות השרת ואת יומן השגיאות של הפריסה.',
        code: 'RESULTS_SERVICE_UNAVAILABLE',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
