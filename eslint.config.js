import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      'no-console': 'off',
      eqeqeq: ['error', 'always'],
      // Express reconoce el manejador de errores por sus cuatro parámetros, aunque no use el último
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
