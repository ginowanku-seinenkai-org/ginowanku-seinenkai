import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import astro from 'eslint-plugin-astro';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', '.astro/', '.data/', '.data.tmp/', '.cache/', 'public/photos/'] },
  js.configs.recommended,
  tseslint.configs.strict,
  astro.configs.recommended,
  {
    files: ['scripts/**/*.ts', '*.config.{js,mjs,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.{ts,astro}'],
    languageOptions: { globals: globals.browser },
  },
  prettier,
);
