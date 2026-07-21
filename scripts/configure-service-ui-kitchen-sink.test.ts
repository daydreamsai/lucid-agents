import { afterEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { configureServiceUiKitchenSinkProject } from './configure-service-ui-kitchen-sink';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(root => rm(root, { recursive: true }))
  );
});

describe('service UI kitchen-sink project configuration', () => {
  it('enriches a generated project once and adds protocol packages', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lucid-ui-kitchen-sink-'));
    temporaryRoots.push(root);
    await mkdir(join(root, 'lib'), { recursive: true });
    await writeFile(
      join(root, 'lib/agent.ts'),
      `import { z } from "zod";
const agent = createAgent({ name: "fixture", version: "1" })
  .use(payments({ config: paymentsFromEnv() }))
  .use(http({ servicePage: serviceUi }))
  .build();
const addEntrypoint = () => {};
export { agent };
`
    );
    await writeFile(
      join(root, 'package.json'),
      `${JSON.stringify({ dependencies: { zod: '^4.0.0' } })}\n`
    );

    await configureServiceUiKitchenSinkProject(root, 'next');
    await configureServiceUiKitchenSinkProject(root, 'next');

    const source = await readFile(join(root, 'lib/agent.ts'), 'utf8');
    const fixture = await readFile(
      join(root, 'lib/service-ui-kitchen-sink.ts'),
      'utf8'
    );
    const packageJson = JSON.parse(
      await readFile(join(root, 'package.json'), 'utf8')
    ) as { dependencies: Record<string, string> };

    expect(source.match(/serviceUiKitchenSinkCard/g)).toHaveLength(2);
    expect(
      source.match(/registerServiceUiKitchenSinkEntrypoints/g)
    ).toHaveLength(2);
    expect(source).toContain('.use(a2a())');
    expect(source).toContain('.use(ap2({ roles: ["merchant"] }))');
    expect(source).toContain('custom.server("lucid-ci-proof"');
    expect(fixture).toContain("key: 'summarize'");
    expect(fixture).toContain("key: 'attest'");
    expect(fixture).toContain("key: 'stream'");
    expect(packageJson.dependencies['@lucid-agents/a2a']).toBe('latest');
    expect(packageJson.dependencies['@lucid-agents/ap2']).toBe('latest');
    expect(packageJson.dependencies['@lucid-agents/mpp']).toBe('latest');
  });

  it('rejects API-only adapters', async () => {
    await expect(
      configureServiceUiKitchenSinkProject(
        '/tmp/unused',
        'tanstack-headless' as never
      )
    ).rejects.toThrow('cannot host the service UI kitchen-sink fixture');
  });

  it('uses the TanStack runtime registry and removes the consumed env helper', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lucid-ui-tanstack-sink-'));
    temporaryRoots.push(root);
    await mkdir(join(root, 'src/lib'), { recursive: true });
    await writeFile(
      join(root, 'src/lib/agent.ts'),
      `import { z } from "zod";
import { payments, paymentsFromEnv } from "@lucid-agents/payments";
const agent = createAgent({ name: "fixture", version: "1" })
  .use(payments({ config: paymentsFromEnv() }))
  .use(http({ servicePage: serviceUi }))
  .build();
const runtime = agent;
export { runtime };
`
    );
    await writeFile(join(root, 'package.json'), '{"dependencies":{}}\n');

    await configureServiceUiKitchenSinkProject(root, 'tanstack-ui');

    const source = await readFile(join(root, 'src/lib/agent.ts'), 'utf8');
    expect(source).toContain(
      'registerServiceUiKitchenSinkEntrypoints(runtime.entrypoints.add)'
    );
    expect(source).toContain('import { payments }');
    expect(source).not.toContain('paymentsFromEnv');
  });
});
