import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI_ADAPTERS = ['hono', 'express', 'tanstack-ui', 'next'] as const;
type UiAdapter = (typeof UI_ADAPTERS)[number];

const fixturePath = fileURLToPath(
  new URL('./fixtures/service-ui-kitchen-sink.ts.template', import.meta.url)
);

function agentPath(projectRoot: string, adapter: UiAdapter): string {
  return join(
    projectRoot,
    adapter === 'next' ? 'lib/agent.ts' : 'src/lib/agent.ts'
  );
}

function assertMarker(source: string, marker: string): void {
  if (!source.includes(marker)) {
    throw new Error(
      `Generated agent is missing kitchen-sink marker: ${marker}`
    );
  }
}

function configureAgentSource(source: string, adapter: UiAdapter): string {
  if (source.includes('registerServiceUiKitchenSinkEntrypoints')) return source;

  const importMarker = 'import { z } from "zod";';
  const paymentsMarker = '.use(payments({ config: paymentsFromEnv() }))';
  const buildMarker = '\n  .build();';
  const exportMarker = '\nexport {';
  for (const marker of [
    importMarker,
    paymentsMarker,
    buildMarker,
    exportMarker,
  ]) {
    assertMarker(source, marker);
  }

  const fixtureImports = `${importMarker}

import { a2a } from "@lucid-agents/a2a";
import { ap2 } from "@lucid-agents/ap2";
import { custom, mpp } from "@lucid-agents/mpp";
import {
  registerServiceUiKitchenSinkEntrypoints,
  serviceUiKitchenSinkCard,
} from "./service-ui-kitchen-sink";`;
  const paymentAndProtocolExtensions = `.use(
    payments({
      config: {
        payTo: "0x0000000000000000000000000000000000000001",
        network: "eip155:84532",
        facilitatorUrl: "https://facilitator.example.test",
        siwx: {
          enabled: true,
          storage: { type: "in-memory" },
          verify: { skipSignatureVerification: true },
        },
      },
    })
  )
  .use(
    mpp({
      config: {
        methods: [custom.server("lucid-ci-proof", {})],
        currency: "usd",
        secretKey: "lucid-ci-mpp-secret",
        verifyCredential: async ({ credential }) =>
          credential.payload.proof === "lucid-ci"
            ? {
                valid: true,
                receipt: "lucid-ci-mpp-receipt",
                payer: "did:example:lucid-ci",
                network: "lucid-ci:test",
              }
            : { valid: false },
      },
    })
  )
  .use(a2a())
  .use(ap2({ roles: ["merchant"] }))`;

  let configured = source.replace(importMarker, fixtureImports);
  configured = configured.replace(
    'import { payments, paymentsFromEnv } from "@lucid-agents/payments";',
    'import { payments } from "@lucid-agents/payments";'
  );
  configured = configured.replace(paymentsMarker, paymentAndProtocolExtensions);
  configured = configured.replace(
    buildMarker,
    '\n  .use(serviceUiKitchenSinkCard())\n  .build();'
  );
  const exportIndex = configured.lastIndexOf(exportMarker);
  const addEntrypoint =
    adapter === 'tanstack-ui' ? 'runtime.entrypoints.add' : 'addEntrypoint';
  configured = `${configured.slice(0, exportIndex)}\n\nregisterServiceUiKitchenSinkEntrypoints(${addEntrypoint});${configured.slice(exportIndex)}`;
  return configured;
}

export async function configureServiceUiKitchenSinkProject(
  projectRoot: string,
  adapter: UiAdapter
): Promise<void> {
  if (!UI_ADAPTERS.includes(adapter)) {
    throw new Error(
      `Adapter ${adapter} cannot host the service UI kitchen-sink fixture.`
    );
  }

  const root = resolve(projectRoot);
  const generatedAgentPath = agentPath(root, adapter);
  const source = await readFile(generatedAgentPath, 'utf8');
  await writeFile(
    generatedAgentPath,
    configureAgentSource(source, adapter),
    'utf8'
  );
  await copyFile(
    fixturePath,
    join(dirname(generatedAgentPath), 'service-ui-kitchen-sink.ts')
  );

  const packageJsonPath = join(root, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    [key: string]: unknown;
  };
  packageJson.dependencies = {
    ...packageJson.dependencies,
    '@lucid-agents/a2a': 'latest',
    '@lucid-agents/ap2': 'latest',
    '@lucid-agents/mpp': 'latest',
  };
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

if (import.meta.main) {
  const [projectRoot, adapter] = process.argv.slice(2);
  if (!projectRoot || !adapter) {
    throw new Error(
      'Usage: bun run scripts/configure-service-ui-kitchen-sink.ts <project-root> <adapter>'
    );
  }
  await configureServiceUiKitchenSinkProject(projectRoot, adapter as UiAdapter);
}
