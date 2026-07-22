import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ServiceUiPreset } from '@lucid-agents/types/http';

const PRESETS = [
  'dossier',
  'folio',
  'console',
] as const satisfies readonly ServiceUiPreset[];

export function serviceUiPreviewWorkerName(preset: ServiceUiPreset): string {
  return `lucid-agents-ui-${preset}`;
}

export async function configureServiceUiCloudflarePreview(
  projectRoot: string,
  preset: ServiceUiPreset
): Promise<void> {
  if (!PRESETS.includes(preset)) {
    throw new Error(
      `Unknown service UI preset ${preset}. Expected ${PRESETS.join(', ')}`
    );
  }

  const root = resolve(projectRoot);
  await mkdir(root, { recursive: true });
  const wranglerConfig = {
    $schema: './node_modules/wrangler/config-schema.json',
    name: serviceUiPreviewWorkerName(preset),
    main: '.open-next/worker.js',
    compatibility_date: '2026-07-20',
    compatibility_flags: ['nodejs_compat'],
    assets: {
      directory: '.open-next/assets',
      binding: 'ASSETS',
    },
    preview_urls: true,
    observability: { enabled: true },
  };

  await Promise.all([
    writeFile(
      resolve(root, 'wrangler.jsonc'),
      `${JSON.stringify(wranglerConfig, null, 2)}\n`
    ),
    writeFile(
      resolve(root, 'open-next.config.ts'),
      'import { defineCloudflareConfig } from "@opennextjs/cloudflare";\n\nexport default defineCloudflareConfig({});\n'
    ),
  ]);
}

if (import.meta.main) {
  const [projectRoot, preset] = process.argv.slice(2);
  if (!projectRoot || !preset) {
    throw new Error(
      'Usage: bun run scripts/configure-service-ui-cloudflare.ts <project-root> <preset>'
    );
  }
  await configureServiceUiCloudflarePreview(
    projectRoot,
    preset as ServiceUiPreset
  );
}
