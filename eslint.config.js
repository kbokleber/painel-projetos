import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'drizzle/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['web/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['vite.config.ts', 'vitest.config.ts', 'drizzle.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  eslintConfigPrettier,
);
