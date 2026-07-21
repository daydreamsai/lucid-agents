import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { PREVIEW_SAFETY_VARIABLES } from './preview-policy';

const ENVIRONMENT_NAME = /^[A-Z][A-Z0-9_]*$/u;

const uniqueEnvironmentNames = z
  .array(z.string().regex(ENVIRONMENT_NAME, 'invalid environment name'))
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: 'custom',
        message: 'must not contain duplicates',
      });
    }
  });

const uniqueNonEmptyStrings = z
  .array(z.string().min(1))
  .min(1)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: 'custom',
        message: 'must not contain duplicates',
      });
    }
  });

const deployManifestSchema = z
  .strictObject({
    $schema: z.string().optional(),
    version: z.literal(1, {
      error: 'lucid.deploy.json version must be 1.',
    }),
    adapter: z.literal('hono', {
      error: 'Only the "hono" deployment adapter is supported.',
    }),
    provider: z.literal('cloudflare', {
      error: 'Only the "cloudflare" deployment provider is supported.',
    }),
    paths: z.strictObject({
      entrypoint: z.string().min(1),
      providerConfig: z.string().min(1),
      environmentFile: z.string().min(1),
    }),
    environment: z
      .strictObject({
        allowlist: uniqueEnvironmentNames,
        secrets: uniqueEnvironmentNames,
        signingKeys: uniqueEnvironmentNames,
        mainnet: z.record(
          z.string().regex(ENVIRONMENT_NAME, 'invalid environment name'),
          uniqueNonEmptyStrings
        ),
      })
      .superRefine((environment, context) => {
        const allowlist = new Set(environment.allowlist);
        const secrets = new Set(environment.secrets);
        for (const name of environment.secrets) {
          if (!allowlist.has(name)) {
            context.addIssue({
              code: 'custom',
              path: ['secrets'],
              message: `${name} is not allowlisted`,
            });
          }
        }
        for (const name of environment.signingKeys) {
          if (!allowlist.has(name)) {
            context.addIssue({
              code: 'custom',
              path: ['signingKeys'],
              message: `${name} is not allowlisted`,
            });
          }
          if (!secrets.has(name)) {
            context.addIssue({
              code: 'custom',
              path: ['signingKeys'],
              message: 'signingKeys must also appear in secrets',
            });
          }
        }
        for (const name of Object.keys(environment.mainnet)) {
          if (!allowlist.has(name)) {
            context.addIssue({
              code: 'custom',
              path: ['mainnet', name],
              message: `${name} is not allowlisted`,
            });
          }
        }
        for (const name of PREVIEW_SAFETY_VARIABLES.keys()) {
          if (!allowlist.has(name)) {
            context.addIssue({
              code: 'custom',
              path: ['allowlist'],
              message: `${name} is required for preview safety`,
            });
          }
        }
      }),
  })
  .meta({ title: 'Lucid deployment manifest' });

export type DeployManifest = z.infer<typeof deployManifestSchema>;
export type ManifestEnvironment = DeployManifest['environment'];

export async function loadDeployManifest(
  path: string,
  manifestName: string
): Promise<DeployManifest> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Missing ${manifestName} in the project root.`);
    }
    throw new Error(
      `Could not parse ${manifestName}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const result = deployManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid ${manifestName}: ${z.prettifyError(result.error)}`
    );
  }
  return result.data;
}

export function createDeployManifestJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(deployManifestSchema) as Record<
    string,
    unknown
  >;
  return {
    ...generated,
    $id: 'https://lucid-agents.dev/schemas/lucid.deploy.v1.json',
  };
}
