import { readFileSync } from 'fs';
import { extname } from 'path';
import type { CatalogItem, CatalogExtensionOptions } from './types';
import { parseCatalogYaml, parseCatalogCsv } from './parser';
import { generateEntrypoints } from './entrypoints';

export type CatalogRuntime = {
  items: CatalogItem[];
};

export function catalog(options: CatalogExtensionOptions): {
  name: string;
  build: (ctx: any) => { catalog?: CatalogRuntime };
  onBuild?: (runtime: any) => Promise<void>;
} {
  let catalogItems: CatalogItem[] = [];
  let pendingCsvParse: Promise<CatalogItem[]> | null = null;

  return {
    name: 'catalog',
    build(ctx: any): { catalog?: CatalogRuntime } {
      const ext = extname(options.file).toLowerCase();

      if (ext === '.yaml' || ext === '.yml') {
        const content = readFileSync(options.file, 'utf-8');
        catalogItems = parseCatalogYaml(content);
      } else if (ext === '.csv') {
        // CSV parsing is async, defer to onBuild
        const content = readFileSync(options.file, 'utf-8');
        pendingCsvParse = parseCatalogCsv(content);
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
    async onBuild(runtime: any): Promise<void> {
      // Resolve CSV if needed
      if (pendingCsvParse) {
        catalogItems = await pendingCsvParse;
        pendingCsvParse = null;
      }

      // Generate and register entrypoints
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
