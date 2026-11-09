import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Money and domain code must stay strictly typed (kickoff section 3).
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // The handoff generator is a standalone Node script that reports to stdout.
    files: ['scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
  {
    ignores: ['.next/**', '.tmp/**', 'node_modules/**', 'contracts/**', 'coverage/**', 'playwright-report/**', 'next-env.d.ts'],
  },
];

export default config;
