import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

describe('Taskmarket client', () => {
  it('should export createTaskmarketClient', async () => {
    const mod = await import('../src/client');
    assert.strictEqual(typeof mod.createTaskmarketClient, 'function');
  });

  it('should create a client with default config', async () => {
    const { createTaskmarketClient } = await import('../src/client');
    const client = createTaskmarketClient();
    assert.ok(client, 'Client should be created');
    assert.strictEqual(typeof client.listTasks, 'function');
    assert.strictEqual(typeof client.getTask, 'function');
    assert.strictEqual(typeof client.createTask, 'function');
    assert.strictEqual(typeof client.claimTask, 'function');
    assert.strictEqual(typeof client.submitWork, 'function');
    assert.strictEqual(typeof client.listSubmissions, 'function');
    assert.strictEqual(typeof client.getWalletBalance, 'function');
  });
});

describe('Taskmarket runtime', () => {
  it('should export createTaskmarketRuntime', async () => {
    const mod = await import('../src/runtime');
    assert.strictEqual(typeof mod.createTaskmarketRuntime, 'function');
  });

  it('should create runtime with mock client', async () => {
    const { createTaskmarketRuntime } = await import('../src/runtime');
    const mockClient = {
      listTasks: async () => ({ tasks: [] }),
      getTask: async () => ({}),
      createTask: async () => ({}),
      claimTask: async () => ({}),
      submitWork: async () => ({}),
      listSubmissions: async () => ({ submissions: [] }),
      getWalletBalance: async () => ({ address: '0x', balanceBaseUnits: '0' }),
    };
    const runtime = createTaskmarketRuntime({ client: mockClient });
    assert.ok(runtime);
    assert.strictEqual(typeof runtime.listTasks, 'function');
    assert.strictEqual(typeof runtime.getTask, 'function');
    assert.strictEqual(typeof runtime.createTask, 'function');
  });

  it('should convert USDC to base units correctly', async () => {
    const { createTaskmarketRuntime } = await import('../src/runtime');
    let capturedBody: any = null;
    const mockClient = {
      listTasks: async () => ({ tasks: [] }),
      getTask: async () => ({}),
      createTask: async (body: any) => {
        capturedBody = body;
        return { taskId: '0x123', id: '0x123', expiryTime: '2026-01-01T00:00:00Z' };
      },
      claimTask: async () => ({}),
      submitWork: async () => ({}),
      listSubmissions: async () => ({ submissions: [] }),
      getWalletBalance: async () => ({ address: '0x', balanceBaseUnits: '0' }),
    };
    const runtime = createTaskmarketRuntime({ client: mockClient });
    await runtime.createTask({
      description: 'Test task',
      rewardUsdc: 5.5,
      durationHours: 24,
      mode: 'bounty',
    });
    assert.strictEqual(capturedBody.reward, '5500000', '5.5 USDC should be 5500000 base units');
  });
});

describe('Taskmarket extension', () => {
  it('should export taskmarket function', async () => {
    const mod = await import('../src');
    assert.strictEqual(typeof mod.taskmarket, 'function');
  });

  it('should create an extension with correct name', async () => {
    const { taskmarket } = await import('../src');
    const ext = taskmarket();
    assert.strictEqual(ext.name, 'taskmarket');
    assert.strictEqual(typeof ext.build, 'function');
  });
});

// Run tests
import { run } from 'node:test';
const stream = run({ timeout: 1000 });
let success = true;
stream.on('fail', () => { success = false; });
stream.on('end', () => {
  process.exit(success ? 0 : 1);
});
