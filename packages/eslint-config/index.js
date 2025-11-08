module.exports = {
  extends: ['eslint:recommended', 'prettier'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: [
    '@typescript-eslint',
    'unused-imports',
    'simple-import-sort',
    'import',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-empty-object-type': 'warn',
    '@typescript-eslint/no-wrapper-object-types': 'warn',
    '@typescript-eslint/no-require-imports': 'warn',

    // Import sorting rules - using simple-import-sort for auto-fixing
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',

    // Import rules
    'import/no-duplicates': 'error',

    // Unused imports plugin
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
      },
    ],

    // General rules
    'no-unused-vars': 'off', // Disabled in favor of @typescript-eslint and unused-imports rules
    'prefer-const': 'error',
    'no-var': 'error',
  },
  settings: {},
  env: {
    es2022: true,
    node: true,
  },
  ignorePatterns: [
    'dist/',
    'build/',
    'node_modules/',
    '*.config.js',
    '*.config.ts',
  ],
};

