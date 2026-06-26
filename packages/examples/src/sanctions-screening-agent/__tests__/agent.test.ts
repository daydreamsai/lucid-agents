import { describe, expect, it } from 'bun:test';
import { createSanctionsScreeningAgent } from '../agent';

describe('createSanctionsScreeningAgent', () => {
  it('should have the correct extensions loaded', async () => {
    const agent = await createSanctionsScreeningAgent();

    // Required extensions for a paid data agent
    expect(agent.payments).toBeDefined();
    expect(agent.analytics).toBeDefined();
    expect(agent.ap2).toBeDefined();

    // These extensions are not used in this example
    expect(agent.a2a).toBeUndefined();
    expect(agent.scheduler).toBeUndefined();
  });
});
