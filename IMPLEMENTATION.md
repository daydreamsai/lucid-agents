=== FILE: packages/macro-api/package.json ===
{
  "name": "@lucid-agents/macro-api",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@lucid-agents/a2a": "workspace:*",
    "@lucid-agents/ap2": "workspace:*",
    "@lucid-agents/core": "workspace:*",
    "@lucid-agents/http": "