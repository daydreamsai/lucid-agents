import { z } from 'zod';

export const CatalogItemSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().optional(),
  price: z
    .union([
      z.string(),
      z.object({
        invoke: z.string().optional(),
        stream: z.string().optional(),
      }),
    ])
    .optional(),
  network: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export type CatalogConfig = {
  items: CatalogItem[];
};

export type HandlerFactory = (item: CatalogItem) => (...args: any[]) => any;

export type CatalogExtensionOptions = {
  file: string;
  keyPrefix?: string;
  network?: string;
  handlerFactory?: HandlerFactory;
  inputSchema?: z.ZodTypeAny;
};
