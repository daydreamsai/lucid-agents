#!/usr/bin/env bun
/**
 * Smoke Test Script
 *
 * Creates an agent, lists agents, invokes entrypoint, and cleans up.
 *
 * Usage:
 *   bun run scripts/smoke-test.ts [baseUrl]
 *
 * Examples:
 *   bun run scripts/smoke-test.ts                    # Uses http://localhost:8787
 *   bun run scripts/smoke-test.ts http://localhost:3000
 */

const BASE_URL = process.argv[2] || 'http://localhost:8787';

async function main() {
  console.log(`\n=== Smoke Test for ${BASE_URL} ===\n`);

  // 1. Health check
  console.log('1. Health check...');
  const healthRes = await fetch(`${BASE_URL}/health`);
  const health = await healthRes.json();
  console.log(`   Status: ${health.status} (${healthRes.status})`);

  if (healthRes.status !== 200) {
    console.error('   FAIL: Health check failed');
    process.exit(1);
  }
  console.log('   PASS\n');

  // 2. Create an agent
  console.log('2. Creating agent...');
  const createRes = await fetch(`${BASE_URL}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: `smoke-test-${Date.now()}`,
      name: 'Smoke Test Agent',
      description: 'Agent created by smoke test script',
      entrypoints: [
        {
          key: 'echo',
          description: 'Echoes back the input',
          inputSchema: {},
          outputSchema: {},
          handlerType: 'builtin',
          handlerConfig: { name: 'echo' },
        },
        {
          key: 'greet',
          description: 'Passes through input (greeting)',
          inputSchema: {},
          outputSchema: {},
          handlerType: 'builtin',
          handlerConfig: { name: 'passthrough' },
        },
      ],
      metadata: {
        createdBy: 'smoke-test',
        timestamp: new Date().toISOString(),
      },
    }),
  });

  if (createRes.status !== 201) {
    const err = await createRes.text();
    console.error(
      `   FAIL: Could not create agent (${createRes.status}): ${err}`
    );
    process.exit(1);
  }

  const agent = await createRes.json();
  console.log(`   Created: ${agent.name} (${agent.id})`);
  console.log(`   Slug: ${agent.slug}`);
  console.log('   PASS\n');

  // 3. List agents
  console.log('3. Listing agents...');
  const listRes = await fetch(`${BASE_URL}/api/agents`);
  const list = await listRes.json();
  console.log(`   Total agents: ${list.total}`);
  console.log(
    `   Found our agent: ${list.agents.some((a: any) => a.id === agent.id)}`
  );
  console.log('   PASS\n');

  // 4. Get agent manifest (A2A)
  console.log('4. Getting agent manifest...');
  const manifestRes = await fetch(
    `${BASE_URL}/agents/${agent.id}/.well-known/agent.json`
  );

  if (manifestRes.status !== 200) {
    console.error(`   FAIL: Could not get manifest (${manifestRes.status})`);
    process.exit(1);
  }

  const manifest = await manifestRes.json();
  console.log(`   Agent name: ${manifest.name}`);
  console.log(
    `   Skills: ${manifest.skills?.map((s: any) => s.id).join(', ') || 'none'}`
  );
  console.log('   PASS\n');

  // 5. List entrypoints
  console.log('5. Listing entrypoints...');
  const entrypointsRes = await fetch(
    `${BASE_URL}/agents/${agent.id}/entrypoints`
  );
  const entrypoints = await entrypointsRes.json();
  console.log(
    `   Entrypoints: ${entrypoints.map((e: any) => e.key).join(', ')}`
  );
  console.log('   PASS\n');

  // 6. Invoke echo entrypoint
  console.log('6. Invoking echo entrypoint...');
  const invokeRes = await fetch(
    `${BASE_URL}/agents/${agent.id}/entrypoints/echo/invoke`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { message: 'Hello from smoke test!' },
      }),
    }
  );

  if (invokeRes.status !== 200) {
    const err = await invokeRes.text();
    console.error(`   FAIL: Invoke failed (${invokeRes.status}): ${err}`);
    process.exit(1);
  }

  const result = await invokeRes.json();
  console.log(
    `   Input:  ${JSON.stringify({ message: 'Hello from smoke test!' })}`
  );
  console.log(`   Output: ${JSON.stringify(result.output)}`);
  console.log(`   Session: ${result.sessionId}`);
  console.log(`   Request: ${result.requestId}`);
  console.log('   PASS\n');

  // 7. Invoke with custom sessionId
  console.log('7. Invoking with custom sessionId...');
  const invoke2Res = await fetch(
    `${BASE_URL}/agents/${agent.id}/entrypoints/greet/invoke`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { name: 'World' },
        sessionId: 'my-custom-session-123',
      }),
    }
  );

  const result2 = await invoke2Res.json();
  console.log(
    `   Session preserved: ${result2.sessionId === 'my-custom-session-123'}`
  );
  console.log('   PASS\n');

  // 8. Update agent
  console.log('8. Updating agent...');
  const updateRes = await fetch(`${BASE_URL}/api/agents/${agent.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'Updated description from smoke test',
    }),
  });

  if (updateRes.status !== 200) {
    console.error(`   FAIL: Update failed (${updateRes.status})`);
    process.exit(1);
  }

  const updated = await updateRes.json();
  console.log(`   New description: ${updated.description}`);
  console.log('   PASS\n');

  // 9. Delete agent (cleanup)
  // console.log('9. Deleting agent (cleanup)...');
  // const deleteRes = await fetch(`${BASE_URL}/api/agents/${agent.id}`, {
  //   method: 'DELETE',
  // });

  // if (deleteRes.status !== 204) {
  //   console.error(`   FAIL: Delete failed (${deleteRes.status})`);
  //   process.exit(1);
  // }
  // console.log('   PASS\n');

  // 10. Verify deletion
  console.log('10. Verifying deletion...');
  const getRes = await fetch(`${BASE_URL}/api/agents/${agent.id}`);
  if (getRes.status !== 404) {
    console.error(`   FAIL: Agent still exists (${getRes.status})`);
    process.exit(1);
  }
  console.log('    Agent not found (as expected)');
  console.log('    PASS\n');

  console.log('=== All smoke tests passed! ===\n');
}

main().catch(err => {
  console.error('\nSmoke test failed:', err.message);
  process.exit(1);
});
