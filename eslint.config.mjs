import next from '@next/eslint-plugin-next';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';

const config = tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      'supabase/**',
      'types/database.types.ts',
    ],
  },
  ...tseslint.configs.recommended,
  unicorn.configs['flat/recommended'],
  {
    plugins: { '@next/next': next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,
    },
  },
  {
    rules: {
      // File and directory names are kebab-case per CLAUDE.md.
      'unicorn/filename-case': [
        'error',
        {
          case: 'kebabCase',
          ignore: [/\.config\.(js|mjs|cjs|ts)$/, /\.setup\.ts$/, /\.types\.ts$/],
        },
      ],
      // Domain language (req, props, params, env, db) is clearer than enforced expansions.
      'unicorn/prevent-abbreviations': 'off',
      // Supabase and Postgres APIs return null; mapping every null to undefined adds noise.
      'unicorn/no-null': 'off',
    },
  },
);

export default config;
