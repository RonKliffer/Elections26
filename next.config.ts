import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  ...(process.env.ELECTION_CONTAINER === '1' ? { output: 'standalone' as const } : {}),
  outputFileTracingIncludes: {
    '/api/*': ['./fixtures/2022/official.json'],
  },
};
export default config;
