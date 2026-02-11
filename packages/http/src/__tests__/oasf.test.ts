import { describe, expect, it } from 'bun:test';

import type { AgentRuntime, EntrypointDef } from '@lucid-agents/types/core';

import { http } from '../extension';

const meta = {
  name: 'oasf-agent',
  version: '1.0.0',
  description: 'OASF test agent',
};

function makeRuntime(
  registration?: {
    selectedServices?: string[];
    oasf?: {
      endpoint?: string;
      version?: string;
      authors?: string[];
      skills?: string[];
      domains?: string[];
      modules?: string[];
      locators?: string[];
    };
  }
): AgentRuntime {
  const entrypoints: EntrypointDef[] = [
    {
      key: 'echo',
      description: 'Echo input',
      handler: async ({ input }) => ({ output: input ?? {} }),
    },
  ];

  return {
    agent: {
      config: { meta },
      getEntrypoint: key => entrypoints.find(entry => entry.key === key),
    } as any,
    entrypoints: {
      add: def => {
        entrypoints.push(def);
      },
      list: () =>
        entrypoints.map(entry => ({
          key: entry.key,
          description: entry.description,
          streaming: Boolean(entry.stream ?? entry.streaming),
        })),
      snapshot: () => [...entrypoints],
    },
    manifest: {
      build: origin => ({ ...meta, url: `${origin}/`, entrypoints: {} }),
      invalidate: () => {},
    },
    identity: registration ? { registration } : undefined,
  } as AgentRuntime;
}

describe('http OASF handler', () => {
  it('returns 404 when OASF is not enabled', async () => {
    const extension = http();
    extension.build({ meta, runtime: {} as AgentRuntime });
    const runtime = makeRuntime();
    extension.onBuild?.(runtime);

    const response = await runtime.handlers!.oasf(
      new Request('https://agent.example.com/.well-known/oasf-record.json')
    );

    expect(response.status).toBe(404);
  });

  it('returns generated OASF record when enabled', async () => {
    const extension = http();
    extension.build({ meta, runtime: {} as AgentRuntime });
    const runtime = makeRuntime({
      selectedServices: ['OASF'],
      oasf: {
        version: '0.8.0',
        authors: ['ops@agent.example.com'],
        skills: ['reasoning'],
        domains: ['finance'],
        modules: ['https://agent.example.com/modules/core'],
        locators: ['https://agent.example.com/.well-known/oasf-record.json'],
      },
    });
    extension.onBuild?.(runtime);

    const response = await runtime.handlers!.oasf(
      new Request('https://agent.example.com/.well-known/oasf-record.json')
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.name).toBe(meta.name);
    expect(body.version).toBe('0.8.0');
    expect(body.entrypoints?.[0]?.key).toBe('echo');
    expect(body.endpoint).toBe(
      'https://agent.example.com/.well-known/oasf-record.json'
    );
  });

  it('fails fast on invalid strict OASF config', () => {
    const extension = http();
    extension.build({ meta, runtime: {} as AgentRuntime });
    const runtime = makeRuntime({
      selectedServices: ['OASF'],
      oasf: {
        version: '0.8.0',
        skills: ['reasoning'],
        domains: ['finance'],
        modules: ['https://agent.example.com/modules/core'],
        locators: ['https://agent.example.com/.well-known/oasf-record.json'],
      },
    });

    expect(() => extension.onBuild?.(runtime)).toThrow(/authors/);
  });
});
