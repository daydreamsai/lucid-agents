module.exports = {
  extends: ['@lucid-agents/eslint-config'],
  env: {
    node: true,
    es2022: true,
  },
  globals: {
    RequestInfo: 'readonly',
    RequestInit: 'readonly',
  },
  rules: {
    // Package-specific overrides can go here
  },
};
