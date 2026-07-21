import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  configureServiceUiCloudflarePreview,
  serviceUiPreviewWorkerName,
} from './configure-service-ui-cloudflare';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(root => rm(root, { recursive: true }))
  );
});

describe('service UI Cloudflare preview configuration', () => {
  it('writes a deterministic OpenNext Worker config for every preset', async () => {
    for (const preset of ['dossier', 'folio', 'console'] as const) {
      const root = await mkdtemp(join(tmpdir(), `lucid-${preset}-`));
      temporaryRoots.push(root);
      await configureServiceUiCloudflarePreview(root, preset);

      const wrangler = JSON.parse(
        await readFile(join(root, 'wrangler.jsonc'), 'utf8')
      ) as Record<string, unknown>;
      expect(wrangler).toMatchObject({
        name: `lucid-agents-ui-${preset}`,
        main: '.open-next/worker.js',
        compatibility_date: '2026-07-20',
        compatibility_flags: ['nodejs_compat'],
        preview_urls: true,
        assets: {
          directory: '.open-next/assets',
          binding: 'ASSETS',
        },
      });
      expect(
        await readFile(join(root, 'open-next.config.ts'), 'utf8')
      ).toContain('defineCloudflareConfig({})');
    }
  });

  it('keeps worker names stable and rejects unsupported presets', async () => {
    expect(serviceUiPreviewWorkerName('folio')).toBe('lucid-agents-ui-folio');
    await expect(
      configureServiceUiCloudflarePreview('/tmp/unused', 'neon' as never)
    ).rejects.toThrow('Unknown service UI preset neon');
  });
});
