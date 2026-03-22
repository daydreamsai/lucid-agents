import { describe, expect, it } from 'bun:test';
import { createIdentityReputationAgent } from '../agent';

describe('createIdentityReputationAgent', () => {
  it('should have the correct extensions loaded', async () => {
    const agent = await createIdentityReputationAgent();
    expect(agent.payments).toBeDefined();
    expect(agent.analytics).toBeDefined();
    expect(agent.ap2).toBeDefined();
    expect(agent.a2a).toBeUndefined();
  });
});
