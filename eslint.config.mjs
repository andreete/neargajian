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
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    // Standalone Node scripts report to stdout; tests may print measured timings.
    files: ['scripts/**/*.mjs', 'scripts/**/*.ts', 'tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    ignores: ['.next/**', '.tmp/**', '.railway/**', '.hosting/**', 'node_modules/**', 'contracts/**', 'coverage/**', 'playwright-report/**', 'next-env.d.ts'],
  },
];

export default config;
