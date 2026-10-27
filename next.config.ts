import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    '/api/*': [
      './fixtures/2022/official.json',
      './fixtures/2022/source.html',
      './fixtures/2022/provenance.json',
    ],
  },
};
export default config;
