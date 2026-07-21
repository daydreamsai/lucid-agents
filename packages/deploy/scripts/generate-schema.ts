import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { format } from 'prettier';

import { createDeployManifestJsonSchema } from '../src/manifest';

const target = resolve(import.meta.dir, '..', 'lucid.deploy.schema.json');
const schema = await format(
  JSON.stringify(createDeployManifestJsonSchema(), null, 2),
  { parser: 'json' }
);
await writeFile(target, schema, 'utf8');
