import { describe, it, expect, beforeEach } from 'bun:test';
import { createHonoRuntime } from '../app';
import { createMemoryAgentStore } from '../store/memory';
import type { AgentStore } from '../store/types';

describe('Hono Runtime API', () => {
  let app: ReturnType<typeof createHonoRuntime>;
  let store: AgentStore;

  beforeEach(() => {
    store = createMemoryAgentStore();
    app = createHonoRuntime({ store });
  });

  // ===========================================================================
  // Health & Documentation
  // ===========================================================================

  describe('GET /health', () => {
    it('returns ok status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /swagger', () => {
    it('returns swagger UI HTML', async () => {
      const res = await app.request('/swagger');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
    });
  });

  describe('GET /doc', () => {
    // TODO: Fix zod 4 compatibility with @hono/zod-openapi
    it.skip('returns OpenAPI spec', async () => {
      const res = await app.request('/doc');
      expect(res.status).toBe(200);

      const spec = await res.json();
      expect(spec.openapi).toBe('3.0.0');
      expect(spec.paths).toBeDefined();
      expect(spec.paths['/health']).toBeDefined();
      expect(spec.paths['/api/agents']).toBeDefined();
    });
  });

  // ===========================================================================
  // Agent CRUD
  // ===========================================================================

  describe('POST /api/agents', () => {
    it('creates an agent', async () => {
      const res = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'test-agent',
          name: 'Test Agent',
          description: 'A test agent',
          entrypoints: [
            {
              key: 'echo',
              description: 'Echo endpoint',
              handlerType: 'builtin',
              handlerConfig: { name: 'echo' },
            },
          ],
        }),
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.slug).toBe('test-agent');
      expect(body.name).toBe('Test Agent');
      expect(body.id).toMatch(/^ag_/);
      expect(body.entrypoints).toHaveLength(1);
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    });

    it('rejects duplicate slug', async () => {
      const payload = {
        slug: 'duplicate-slug',
        name: 'Agent 1',
        entrypoints: [
          { key: 'echo', handlerType: 'builtin', handlerConfig: { name: 'echo' } },
        ],
      };

      // First creation should succeed
      const res1 = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res1.status).toBe(201);

      // Second creation should fail with 409
      const res2 = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, name: 'Agent 2' }),
      });
      expect(res2.status).toBe(409);

      const body = await res2.json();
      expect(body.code).toBe('SLUG_EXISTS');
    });

    it('requires at least one entrypoint', async () => {
      const res = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'no-entrypoints',
          name: 'No Entrypoints',
          entrypoints: [],
        }),
      });

      expect(res.status).toBe(400);
    });

    it('validates slug format', async () => {
      const res = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'Invalid Slug!',
          name: 'Agent',
          entrypoints: [
            { key: 'echo', handlerType: 'builtin', handlerConfig: { name: 'echo' } },
          ],
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/agents', () => {
    it('returns empty list initially', async () => {
      const res = await app.request('/api/agents');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.agents).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('returns created agents', async () => {
      // Create two agents
      await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'agent-1',
          name: 'Agent 1',
          entrypoints: [
            { key: 'echo', handlerType: 'builtin', handlerConfig: { name: 'echo' } },
          ],
        }),
      });

      await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'agent-2',
          name: 'Agent 2',
          entrypoints: [
            { key: 'echo', handlerType: 'builtin', handlerConfig: { name: 'echo' } },
          ],
        }),
      });

      const res = await app.request('/api/agents');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.agents).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it('supports pagination', async () => {
      // Create 5 agents
      for (let i = 0; i < 5; i++) {
        await app.request('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: `agent-${i}`,
            name: `Agent ${i}`,
            entrypoints: [
              { key: 'echo', handlerType: 'builtin', handlerConfig: { name: 'echo' } },
            ],
          }),
        });
      }

      // Get first page
      const res1 = await app.request('/api/agents?limit=2&offset=0');
      const body1 = await res1.json();
      expect(body1.agents).toHaveLength(2);
      expect(body1.total).toBe(5);
      expect(body1.limit).toBe(2);
      expect(body1.offset).toBe(0);

      // Get second page
      const res2 = await app.request('/api/agents?limit=2&offset=2');
      const body2 = await res2.json();
      expect(body2.agents).toHaveLength(2);
      expect(body2.offset).toBe(2);
    });
  });

  describe('GET /api/agents/{agentId}', () => {
    it('returns agent by ID', async () => {
      // Create agent
      const createRes = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'my-agent',
          name: 'My Agent',
          entrypoints: [
            { key: 'echo', handlerType: 'builtin', handlerConfig: { name: 'echo' } },
          ],
        }),
      });
      const agent = await createRes.json();

      // Get by ID
      const res = await app.request(`/api/agents/${agent.id}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe(agent.id);
      expect(body.slug).toBe('my-agent');
    });

    it('returns 404 for unknown agent', async () => {
      const res = await app.request('/api/agents/ag_nonexistent');
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });
  });

  describe('PUT /api/agents/{agentId}', () => {
    it('updates agent', async () => {
      // Create agent
      const createRes = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'original-slug',
          name: 'Original Name',
          entrypoints: [
            { key: 'echo', handlerType: 'builtin', handlerConfig: { name: 'echo' } },
          ],
        }),
      });
      const agent = await createRes.json();

      // Update
      const updateRes = await app.request(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Name',
          description: 'New description',
        }),
      });

      expect(updateRes.status).toBe(200);

      const body = await updateRes.json();
      expect(body.name).toBe('Updated Name');
      expect(body.description).toBe('New description');
      expect(body.slug).toBe('original-slug'); // Unchanged
    });

    it('returns 404 for unknown agent', async () => {
      const res = await app.request('/api/agents/ag_nonexistent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/agents/{agentId}', () => {
    it('deletes agent', async () => {
      // Create agent
      const createRes = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'to-delete',
          name: 'To Delete',
          entrypoints: [
            { key: 'echo', handlerType: 'builtin', handlerConfig: { name: 'echo' } },
          ],
        }),
      });
      const agent = await createRes.json();

      // Delete
      const deleteRes = await app.request(`/api/agents/${agent.id}`, {
        method: 'DELETE',
      });
      expect(deleteRes.status).toBe(204);

      // Verify deleted
      const getRes = await app.request(`/api/agents/${agent.id}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for unknown agent', async () => {
      const res = await app.request('/api/agents/ag_nonexistent', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // Agent Invocation
  // ===========================================================================

  describe('GET /agents/{agentId}/.well-known/agent.json', () => {
    it('returns agent manifest', async () => {
      // Create agent
      const createRes = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'manifest-test',
          name: 'Manifest Test Agent',
          description: 'Test description',
          entrypoints: [
            {
              key: 'echo',
              description: 'Echo endpoint',
              handlerType: 'builtin',
              handlerConfig: { name: 'echo' },
            },
            {
              key: 'passthrough',
              description: 'Passthrough endpoint',
              handlerType: 'builtin',
              handlerConfig: { name: 'passthrough' },
            },
          ],
        }),
      });
      const agent = await createRes.json();

      // Get manifest
      const res = await app.request(
        `/agents/${agent.id}/.well-known/agent.json`
      );
      expect(res.status).toBe(200);

      const manifest = await res.json();
      expect(manifest.name).toBe('Manifest Test Agent');
      expect(manifest.description).toBe('Test description');
      expect(manifest.skills).toHaveLength(2);
      expect(manifest.skills[0].id).toBe('echo');
    });

    it('returns 404 for disabled agent', async () => {
      // Create disabled agent
      const createRes = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'disabled-agent',
          name: 'Disabled Agent',
          enabled: false,
          entrypoints: [
            { key: 'echo', handlerType: 'builtin', handlerConfig: { name: 'echo' } },
          ],
        }),
      });
      const agent = await createRes.json();

      const res = await app.request(
        `/agents/${agent.id}/.well-known/agent.json`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('GET /agents/{agentId}/entrypoints', () => {
    it('returns entrypoints list', async () => {
      // Create agent
      const createRes = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'entrypoints-test',
          name: 'Entrypoints Test',
          entrypoints: [
            {
              key: 'echo',
              description: 'Echo',
              handlerType: 'builtin',
              handlerConfig: { name: 'echo' },
            },
          ],
        }),
      });
      const agent = await createRes.json();

      const res = await app.request(`/agents/${agent.id}/entrypoints`);
      expect(res.status).toBe(200);

      const entrypoints = await res.json();
      expect(entrypoints).toHaveLength(1);
      expect(entrypoints[0].key).toBe('echo');
    });
  });

  describe('POST /agents/{agentId}/entrypoints/{key}/invoke', () => {
    it('invokes echo handler', async () => {
      // Create agent
      const createRes = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'echo-agent',
          name: 'Echo Agent',
          entrypoints: [
            {
              key: 'echo',
              handlerType: 'builtin',
              handlerConfig: { name: 'echo' },
            },
          ],
        }),
      });
      const agent = await createRes.json();

      // Invoke
      const invokeRes = await app.request(
        `/agents/${agent.id}/entrypoints/echo/invoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { message: 'Hello, World!' },
          }),
        }
      );

      expect(invokeRes.status).toBe(200);

      const result = await invokeRes.json();
      expect(result.output).toEqual({ message: 'Hello, World!' });
      expect(result.sessionId).toBeDefined();
      expect(result.requestId).toBeDefined();
    });

    it('invokes passthrough handler', async () => {
      // Create agent
      const createRes = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'passthrough-agent',
          name: 'Passthrough Agent',
          entrypoints: [
            {
              key: 'pass',
              handlerType: 'builtin',
              handlerConfig: { name: 'passthrough' },
            },
          ],
        }),
      });
      const agent = await createRes.json();

      // Invoke
      const invokeRes = await app.request(
        `/agents/${agent.id}/entrypoints/pass/invoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { data: [1, 2, 3] },
          }),
        }
      );

      expect(invokeRes.status).toBe(200);

      const result = await invokeRes.json();
      expect(result.output).toEqual({ data: [1, 2, 3] });
    });

    it('uses provided sessionId', async () => {
      // Create agent
      const createRes = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'session-test',
          name: 'Session Test',
          entrypoints: [
            { key: 'echo', handlerType: 'builtin', handlerConfig: { name: 'echo' } },
          ],
        }),
      });
      const agent = await createRes.json();

      // Invoke with custom sessionId
      const invokeRes = await app.request(
        `/agents/${agent.id}/entrypoints/echo/invoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { test: true },
            sessionId: 'my-custom-session',
          }),
        }
      );

      const result = await invokeRes.json();
      expect(result.sessionId).toBe('my-custom-session');
    });

    it('returns 404 for unknown agent', async () => {
      const res = await app.request(
        '/agents/ag_nonexistent/entrypoints/echo/invoke',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: {} }),
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 404 for unknown entrypoint', async () => {
      // Create agent
      const createRes = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'entrypoint-test',
          name: 'Entrypoint Test',
          entrypoints: [
            { key: 'echo', handlerType: 'builtin', handlerConfig: { name: 'echo' } },
          ],
        }),
      });
      const agent = await createRes.json();

      // Try unknown entrypoint
      const res = await app.request(
        `/agents/${agent.id}/entrypoints/unknown/invoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: {} }),
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('ENTRYPOINT_NOT_FOUND');
    });

    it('returns 404 for disabled agent', async () => {
      // Create disabled agent
      const createRes = await app.request('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'disabled-invoke',
          name: 'Disabled',
          enabled: false,
          entrypoints: [
            { key: 'echo', handlerType: 'builtin', handlerConfig: { name: 'echo' } },
          ],
        }),
      });
      const agent = await createRes.json();

      const res = await app.request(
        `/agents/${agent.id}/entrypoints/echo/invoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: {} }),
        }
      );

      expect(res.status).toBe(404);
    });
  });
});
