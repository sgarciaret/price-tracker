import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'web/dist/**', 'data/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: globals.browser,
    },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Debe ir al final: desactiva las reglas de ESLint que chocan con Prettier.
  prettier,
);
