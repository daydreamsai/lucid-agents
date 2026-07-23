import type { BuildContext, EntrypointDef } from '@lucid-agents/types/core';
import type { WalletsRuntime } from '@lucid-agents/types/wallets';
import { describe, expect, it } from 'bun:test';

import { identity } from '../extension';

function makeContext(): BuildContext {
  const entrypoints: EntrypointDef[] = [];
  return {
    meta: {
      name: 'identity-agent',
      version: '1.0.0',
      description: 'Identity extension test',
    },
    runtime: {
      agent: {
        config: {
          meta: {
            name: 'identity-agent',
            version: '1.0.0',
            description: 'Identity extension test',
          },
        },
        getEntrypoint: key => entrypoints.find(entry => entry.key === key),
        listEntrypoints: () => [...entrypoints],
      },
      entrypoints: {
        add: entrypoint => entrypoints.push(entrypoint),
        list: () => [],
        snapshot: () => [...entrypoints],
      },
      manifest: {
        build: () => ({
          name: 'identity-agent',
          version: '1.0.0',
          capabilities: {},
          skills: [],
          url: 'https://agent.example.com',
          entrypoints: {},
        }),
        invalidate: () => {},
      },
      close: async () => {},
    },
  };
}

describe('identity extension runtime state', () => {
  it('owns OASF generation and reads the live entrypoint registry', async () => {
    const context = makeContext();
    const extension = identity({
      config: {
        trust: { trustModels: ['feedback'] },
        registration: {
          selectedServices: ['OASF'],
          oasf: {
            authors: ['ops@agent.example.com'],
            skills: [],
            domains: ['finance'],
            modules: ['https://agent.example.com/modules/core'],
            locators: [],
          },
        },
      },
    });
    const slice = await extension.build(context);

    context.runtime.entrypoints.add({ key: 'late-entrypoint' });
    const record = slice.identity?.buildOASFRecord?.(
      'https://agent.example.com/.well-known/oasf-record.json?ignored=true'
    );

    expect(record?.name).toBe('identity-agent');
    expect(record?.endpoint).toBe(
      'https://agent.example.com/.well-known/oasf-record.json'
    );
    expect(record?.entrypoints.map(entry => entry.key)).toEqual([
      'late-entrypoint',
    ]);
  });

  it('resolves a configured relative OASF endpoint against the request origin', async () => {
    const extension = identity({
      config: {
        trust: { trustModels: ['feedback'] },
        registration: {
          selectedServices: ['OASF'],
          oasf: {
            endpoint: '/custom/oasf.json',
            authors: [],
            skills: [],
            domains: [],
            modules: [],
            locators: [],
          },
        },
      },
    });
    const slice = await extension.build(makeContext());

    const record = slice.identity?.buildOASFRecord?.(
      'https://agent.example.com/.well-known/oasf-record.json?ignored=true'
    );

    expect(record?.endpoint).toBe('https://agent.example.com/custom/oasf.json');
  });

  it('fails closed when registration is requested without any wallet', async () => {
    const extension = identity({
      config: { domain: 'agent.example.com', autoRegister: true },
    });

    await expect(extension.build(makeContext())).rejects.toThrow(
      'developer or agent wallet'
    );
  });

  it('resolves read-only identity configuration without a wallet', async () => {
    const extension = identity({
      config: {
        domain: 'agent.example.com',
        chainId: 84532,
        rpcUrl: 'http://localhost:8545',
        registrationDiscovery: {
          fetch: async () => new Response(null, { status: 404 }),
        },
      },
    });

    const slice = await extension.build(makeContext());

    expect(slice.identity?.result?.didRegister).not.toBe(true);
    expect(slice.identity?.result?.clients?.identity).toBeDefined();
  });

  it('treats an isolated false registration default as unconfigured', async () => {
    const extension = identity({
      config: { autoRegister: false },
    });

    const slice = await extension.build(makeContext());

    expect(slice.identity).toBeUndefined();
    expect(slice.trust).toBeUndefined();
  });

  it('uses a developer-only wallet instead of skipping identity resolution', async () => {
    const context = makeContext();
    let walletClientRequests = 0;
    (
      context.runtime as BuildContext['runtime'] & { wallets: WalletsRuntime }
    ).wallets = {
      developer: {
        kind: 'local',
        connector: {
          getWalletMetadata: async () => ({
            address: '0x0000000000000000000000000000000000000001',
          }),
          signChallenge: async () => '0xsignature',
          getWalletClient: async () => {
            walletClientRequests += 1;
            return undefined;
          },
          getPublicClient: async () => undefined,
        },
      },
    } as unknown as WalletsRuntime;
    const extension = identity({
      config: {
        domain: 'agent.example.com',
        chainId: 84532,
        rpcUrl: 'http://localhost:8545',
        autoRegister: false,
        registrationDiscovery: {
          fetch: async () => new Response(null, { status: 404 }),
        },
      },
    });

    const slice = await extension.build(context);

    expect(walletClientRequests).toBeGreaterThan(0);
    expect(slice.identity?.result).toBeDefined();
  });
});
