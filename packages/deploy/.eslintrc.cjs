module.exports = {
  extends: ['@lucid-agents/eslint-config'],
  env: {
    node: true,
    es2022: true,
  },
  globals: {
    Bun: 'readonly',
    NodeJS: 'readonly',
  },
};
