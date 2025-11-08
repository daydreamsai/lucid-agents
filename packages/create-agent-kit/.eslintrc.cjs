module.exports = {
  extends: ['@lucid-agents/eslint-config'],
  env: {
    node: true,
    es2022: true,
  },
  globals: {
    NodeJS: 'readonly',
  },
  rules: {
    // Allow while(true) for interactive prompts
    'no-constant-condition': ['error', { checkLoops: false }],
  },
};

