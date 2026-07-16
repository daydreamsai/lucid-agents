import { describe, expect, it } from 'bun:test';

import type { AgentRuntime, EntrypointDef } from '@lucid-agents/types/core';
import type { AgentHttpRuntime } from '@lucid-agents/types/http';
import type { IdentityRuntime, OASFRecord } from '@lucid-agents/types/identity';

import { http } from '../extension';

const meta = {
  name: 'oasf-agent',
  version: '1.0.0',
  description: 'OASF test agent',
};

type IdentityAwareRuntime = AgentRuntime<{ identity?: IdentityRuntime }>;

function makeRuntime(record?: OASFRecord): IdentityAwareRuntime {
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
      listEntrypoints: () => [...entrypoints],
    },
    entrypoints: {
      add: def => entrypoints.push(def),
      list: () =>
        entrypoints.map(entry => ({
          key: entry.key,
          description: entry.description,
          streaming: Boolean(entry.stream),
        })),
      snapshot: () => [...entrypoints],
    },
    manifest: {
      build: origin => ({ ...meta, url: `${origin}/`, entrypoints: {} }),
      invalidate: () => {},
    },
    close: async () => {},
    identity: record ? { buildOASFRecord: () => record } : undefined,
  } as IdentityAwareRuntime;
}

function attachHttp(runtime: IdentityAwareRuntime) {
  const extension = http();
  const slice = extension.build({ meta, runtime }) as {
    http: AgentHttpRuntime;
  };
  return slice.http.handlers;
}

describe('http OASF handler', () => {
  it('returns 404 when the identity capability does not expose OASF', async () => {
    const handlers = attachHttp(makeRuntime());
    const response = await handlers.oasf(
      new Request('https://agent.example.com/.well-known/oasf-record.json')
    );

    expect(response.status).toBe(404);
  });

  it('serves the identity-owned OASF record without reinterpreting it', async () => {
    const record: OASFRecord = {
      type: 'https://docs.agntcy.org/oasf/oasf-server/',
      name: meta.name,
      description: meta.description,
      version: '0.8.0',
      endpoint: 'https://agent.example.com/.well-known/oasf-record.json',
      authors: ['ops@agent.example.com'],
      skills: ['reasoning'],
      domains: ['finance'],
      modules: ['https://agent.example.com/modules/core'],
      locators: ['https://agent.example.com/.well-known/oasf-record.json'],
      entrypoints: [{ key: 'echo', description: 'Echo input' }],
    };
    const handlers = attachHttp(makeRuntime(record));

    const response = await handlers.oasf(
      new Request('https://agent.example.com/.well-known/oasf-record.json')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(record);
  });
});
