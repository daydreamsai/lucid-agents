import { describe, expect, it } from 'bun:test';

const SERVER_ADAPTERS = ['hono', 'express'] as const;

describe('server adapter production scripts', () => {
  for (const adapter of SERVER_ADAPTERS) {
    it(`${adapter} starts the artifact produced by its build`, async () => {
      const manifest = (await Bun.file(
        `${import.meta.dir}/../adapters/${adapter}/package.json`
      ).json()) as { scripts: Record<string, string> };

      expect(manifest.scripts.build).toContain('--outdir=dist');
      expect(manifest.scripts.start).toBe('bun run dist/index.js');
    });
  }
});
