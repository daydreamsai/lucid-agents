import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export const packedPaymentStorageSubpaths = {
  '@lucid-agents/payments': [
    './storage/batch-sqlite',
    './storage/batch-postgres',
  ],
  '@lucid-agents/mpp': ['./storage/sqlite', './storage/postgres'],
} as const;

type PackedPackageName = keyof typeof packedPaymentStorageSubpaths;

function run(
  command: string[],
  options: { cwd: string; env?: Record<string, string | undefined> }
): string {
  const result = Bun.spawnSync({
    cmd: command,
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  if (result.exitCode !== 0) {
    throw new Error(
      `Command failed (${command.join(' ')}):\n${stdout}${stderr}`
    );
  }
  return stdout;
}

function packageDirectory(name: PackedPackageName): string {
  return name === '@lucid-agents/payments'
    ? join(repoRoot, 'packages', 'payments')
    : join(repoRoot, 'packages', 'mpp');
}

async function packAndExtract(
  name: PackedPackageName,
  tempRoot: string
): Promise<string> {
  const packRoot = join(tempRoot, 'archives');
  await mkdir(packRoot, { recursive: true });
  const stdout = run(
    [
      'npm',
      'pack',
      '--json',
      '--pack-destination',
      packRoot,
      packageDirectory(name),
    ],
    { cwd: repoRoot }
  );
  const results = JSON.parse(stdout) as Array<{ filename?: string }>;
  const filename = results[0]?.filename;
  if (!filename)
    throw new Error(`npm pack did not return an archive for ${name}`);

  const extractionRoot = join(
    tempRoot,
    'extract',
    name.replaceAll('/', '-').replace('@', '')
  );
  await mkdir(extractionRoot, { recursive: true });
  run(['tar', '-xzf', join(packRoot, filename), '-C', extractionRoot], {
    cwd: repoRoot,
  });

  const destination = join(tempRoot, 'node_modules', ...name.split('/'));
  await mkdir(dirname(destination), { recursive: true });
  await rename(join(extractionRoot, 'package'), destination);
  return destination;
}

async function assertPackedExports(
  name: PackedPackageName,
  packageRoot: string
): Promise<void> {
  const manifest = JSON.parse(
    await readFile(join(packageRoot, 'package.json'), 'utf8')
  ) as {
    exports?: Record<
      string,
      string | { types?: string; import?: string; default?: string }
    >;
  };
  for (const subpath of packedPaymentStorageSubpaths[name]) {
    const target = manifest.exports?.[subpath];
    if (!target || typeof target === 'string') {
      throw new Error(`${name} is missing its packed ${subpath} export map`);
    }
    for (const condition of ['types', 'import', 'default'] as const) {
      const relativePath = target[condition];
      if (!relativePath) {
        throw new Error(
          `${name} ${subpath} is missing its ${condition} export condition`
        );
      }
      await readFile(join(packageRoot, relativePath));
    }
  }
}

const probeSource = `
import { join } from 'node:path';

import {
  SQLiteBatchChannelStorage,
  createSQLiteBatchChannelStorage,
} from '@lucid-agents/payments/storage/batch-sqlite';
import {
  PostgresBatchChannelStorage,
  createPostgresBatchChannelStorage,
} from '@lucid-agents/payments/storage/batch-postgres';
import {
  SQLiteMppChallengeStore,
  createSQLiteMppChallengeStore,
  SQLiteTempoSessionStore,
  createSQLiteTempoSessionStore,
} from '@lucid-agents/mpp/storage/sqlite';
import {
  PostgresMppChallengeStore,
  createPostgresMppChallengeStore,
  PostgresTempoSessionStore,
  createPostgresTempoSessionStore,
} from '@lucid-agents/mpp/storage/postgres';

const tempRoot = process.env.PACKED_PAYMENT_STORAGE_TEMP;
if (!tempRoot) throw new Error('PACKED_PAYMENT_STORAGE_TEMP is required');

for (const exported of [
  SQLiteBatchChannelStorage,
  createSQLiteBatchChannelStorage,
  PostgresBatchChannelStorage,
  createPostgresBatchChannelStorage,
  SQLiteMppChallengeStore,
  createSQLiteMppChallengeStore,
  SQLiteTempoSessionStore,
  createSQLiteTempoSessionStore,
  PostgresMppChallengeStore,
  createPostgresMppChallengeStore,
  PostgresTempoSessionStore,
  createPostgresTempoSessionStore,
]) {
  if (typeof exported !== 'function') {
    throw new Error('A packed payment storage export is not callable');
  }
}

const batchSqlite = createSQLiteBatchChannelStorage(
  join(tempRoot, 'packed-batch.db'),
  { namespace: 'packed-check' }
);
if (batchSqlite.durable !== true) {
  throw new Error('Packed batch SQLite storage is not marked durable');
}
if ((await batchSqlite.list()).length !== 0) {
  throw new Error('Fresh packed batch SQLite storage is not empty');
}
await batchSqlite.clear();
await batchSqlite.close();

const now = Date.now();
const mppSqlite = createSQLiteMppChallengeStore(
  join(tempRoot, 'packed-mpp.db'),
  { namespace: 'packed-check' }
);
const issue = await mppSqlite.issue({
  challengeId: 'packed-challenge',
  binding: {
    entrypointKey: 'packed',
    operation: 'invoke',
    challengeDigest: 'sha-256=:cGFja2Vk:',
  },
  issuedAt: now,
  expiresAt: now + 60_000,
});
if (issue.status !== 'issued') {
  throw new Error('Packed MPP SQLite storage did not issue a challenge');
}
await mppSqlite.close();

const tempoSqlite = createSQLiteTempoSessionStore(
  join(tempRoot, 'packed-tempo-session.db'),
  { namespace: 'packed-check' }
);
await tempoSqlite.put('packed-channel', { spent: 1n, units: 1 });
const packedTempoChannel = await tempoSqlite.get('packed-channel');
if (
  !packedTempoChannel ||
  typeof packedTempoChannel !== 'object' ||
  packedTempoChannel.spent !== 1n
) {
  throw new Error('Packed Tempo SQLite storage did not preserve channel state');
}
await tempoSqlite.close();

const batchPostgres = createPostgresBatchChannelStorage(
  'postgresql://127.0.0.1/packed-import-only',
  { namespace: 'packed-check' }
);
if (batchPostgres.durable !== true) {
  throw new Error('Packed batch Postgres storage is not marked durable');
}
await batchPostgres.close();

const mppPostgres = createPostgresMppChallengeStore(
  'postgresql://127.0.0.1/packed-import-only',
  { namespace: 'packed-check' }
);
await mppPostgres.close();

const tempoPostgres = createPostgresTempoSessionStore(
  'postgresql://127.0.0.1/packed-import-only',
  { namespace: 'packed-check' }
);
await tempoPostgres.close();
`;

export async function checkPackedPaymentStorage(): Promise<void> {
  const tempRoot = await mkdtemp(join(tmpdir(), 'lucid-payment-storage-pack-'));
  try {
    const installed = new Map<PackedPackageName, string>();
    for (const name of Object.keys(
      packedPaymentStorageSubpaths
    ) as PackedPackageName[]) {
      installed.set(name, await packAndExtract(name, tempRoot));
    }
    for (const [name, packageRoot] of installed) {
      await assertPackedExports(name, packageRoot);
    }

    await mkdir(join(tempRoot, 'node_modules'), { recursive: true });
    await symlink(
      join(repoRoot, 'node_modules', 'pg'),
      join(tempRoot, 'node_modules', 'pg'),
      'junction'
    );
    const probePath = join(tempRoot, 'probe.mjs');
    await writeFile(probePath, probeSource);
    run([process.execPath, probePath], {
      cwd: tempRoot,
      env: {
        ...process.env,
        PACKED_PAYMENT_STORAGE_TEMP: tempRoot,
      },
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
  console.info(
    'Packed payment storage export maps and SQLite/Postgres imports are valid.'
  );
}

if (import.meta.main) {
  await checkPackedPaymentStorage();
}
