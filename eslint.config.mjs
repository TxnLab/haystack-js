// @ts-check

import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import eslintConfigPrettier from 'eslint-config-prettier'
import importX from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'eslint.config.mjs',
      'examples/react/vite.config.ts',
    ],
  },
  {
    files: ['packages/haystack/src/**/*.ts', 'packages/haystack/tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './packages/haystack/tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      // @ts-expect-error https://github.com/typescript-eslint/typescript-eslint/issues/11543
      'import-x': importX,
    },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
    },
  },
  {
    files: ['packages/haystack/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['examples/node-cli/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './examples/node-cli/tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    files: ['examples/react/src/**/*.ts', 'examples/react/src/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: './examples/react/tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
  },
  eslintConfigPrettier,
)
