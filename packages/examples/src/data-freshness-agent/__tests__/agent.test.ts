import { describe, expect, it } from 'bun:test';
import { createDataFreshnessAgent } from '../agent';

describe('createDataFreshnessAgent', () => {
  it('should have the correct extensions loaded', async () => {
    const agent = await createDataFreshnessAgent();

    expect(agent.payments).toBeDefined();
    expect(agent.analytics).toBeDefined();
    expect(agent.ap2).toBeDefined();
    expect(agent.a2a).toBeUndefined();
  });
});
