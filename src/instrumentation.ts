export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build' &&
    process.env.VITEST !== 'true'
  ) {
    const { getElectionService } = await import('./lib/server/runtime');
    await getElectionService().start();
  }
}
