import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    '/api/*': ['./fixtures/2022/official.json'],
  },
};
export default config;
