import { readFileSync } from 'fs';
import { extname } from 'path';
import type {
  Extension,
  BuildContext,
  AgentRuntime,
} from '@lucid-agents/types/core';
import type { CatalogItem, CatalogExtensionOptions } from './types';
import { parseCatalogYaml, parseCatalogCsv } from './parser';
import { generateEntrypoints } from './entrypoints';

export type CatalogRuntime = {
  items: CatalogItem[];
};

export function catalog(
  options: CatalogExtensionOptions,
): Extension<{ catalog?: CatalogRuntime }> {
  let catalogItems: CatalogItem[] = [];

  return {
    name: 'catalog',
    build(ctx: BuildContext): { catalog?: CatalogRuntime } {
      const ext = extname(options.file).toLowerCase();
      const content = readFileSync(options.file, 'utf-8');

      if (ext === '.yaml' || ext === '.yml') {
        catalogItems = parseCatalogYaml(content);
      } else if (ext === '.csv') {
        catalogItems = parseCatalogCsv(content);
      } else {
        throw new Error(
          `Unsupported catalog file format: ${ext}. Use .yaml, .yml, or .csv`,
        );
      }

      return {
        catalog: {
          items: catalogItems,
        },
      };
    },
    async onBuild(runtime: AgentRuntime): Promise<void> {
      const entrypoints = generateEntrypoints(catalogItems, {
        keyPrefix: options.keyPrefix,
        network: options.network,
        handlerFactory: options.handlerFactory,
        inputSchema: options.inputSchema,
      });

      for (const ep of entrypoints) {
        runtime.entrypoints.add(ep);
      }
    },
  };
}
