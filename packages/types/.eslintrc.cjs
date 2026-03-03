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
    // Additional rules specific to agent-kit can go here
  },
};
