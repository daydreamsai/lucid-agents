import { describe, expect, it } from 'bun:test';
import { createSupplierReliabilityAgent } from '../agent';

describe('createSupplierReliabilityAgent', () => {
  it('should have the correct extensions loaded', async () => {
    const agent = await createSupplierReliabilityAgent();
    expect(agent.payments).toBeDefined();
    expect(agent.analytics).toBeDefined();
    expect(agent.ap2).toBeDefined();
    expect(agent.a2a).toBeUndefined();
  });
});
