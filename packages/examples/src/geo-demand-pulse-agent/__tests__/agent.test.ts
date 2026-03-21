import { describe, expect, it } from 'bun:test';
import { createGeoDemandAgent } from '../agent';

describe('createGeoDemandAgent', () => {
  it('should have the correct extensions loaded', async () => {
    const agent = await createGeoDemandAgent();
    expect(agent.payments).toBeDefined();
    expect(agent.analytics).toBeDefined();
    expect(agent.ap2).toBeDefined();
    expect(agent.a2a).toBeUndefined();
  });
});
