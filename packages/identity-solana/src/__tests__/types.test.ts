import { describe, expect, it } from 'bun:test';
import {
  toRegistrationEntry,
  buildSolanaTrustConfig,
  type SolanaIdentityRecord,
} from '../types.js';

const MOCK_PROGRAM_ID = 'AgentId11111111111111111111111111111111111111';

const mockRecord: SolanaIdentityRecord = {
  agentId: 42,
  owner: '9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz',
  agentURI: 'https://my-agent.example.com/.well-known/agent-registration.json',
  network: 'solana:devnet',
};

describe('toRegistrationEntry', () => {
  it('creates a CAIP-10 registration entry', () => {
    const entry = toRegistrationEntry(mockRecord, MOCK_PROGRAM_ID, 'devnet');
    expect(entry.agentId).toBe('42');
    expect(entry.agentRegistry).toBe(`solana:devnet:${MOCK_PROGRAM_ID}`);
    expect(entry.agentAddress).toBe(
      `solana:devnet:${mockRecord.owner}`
    );
  });

  it('stringifies agentId', () => {
    const record = { ...mockRecord, agentId: 0 };
    const entry = toRegistrationEntry(record, MOCK_PROGRAM_ID, 'mainnet-beta');
    expect(entry.agentId).toBe('0');
  });

  it('uses mainnet-beta cluster', () => {
    const entry = toRegistrationEntry(mockRecord, MOCK_PROGRAM_ID, 'mainnet-beta');
    expect(entry.agentRegistry).toContain('solana:mainnet-beta');
    expect(entry.agentAddress).toContain('solana:mainnet-beta');
  });
});

describe('buildSolanaTrustConfig', () => {
  it('builds trust config from Solana identity record', () => {
    const trust = buildSolanaTrustConfig(mockRecord, MOCK_PROGRAM_ID, 'devnet');
    expect(trust.registrations).toHaveLength(1);
    expect(trust.trustModels).toContain('feedback');
    expect(trust.trustModels).toContain('inference-validation');
  });

  it('uses custom trust models', () => {
    const trust = buildSolanaTrustConfig(mockRecord, MOCK_PROGRAM_ID, 'devnet', [
      'tee-attestation',
    ]);
    expect(trust.trustModels).toEqual(['tee-attestation']);
  });

  it('includes correct CAIP-10 registry in registration entry', () => {
    const trust = buildSolanaTrustConfig(mockRecord, MOCK_PROGRAM_ID, 'devnet');
    expect(trust.registrations![0].agentRegistry).toBe(
      `solana:devnet:${MOCK_PROGRAM_ID}`
    );
  });

  it('defaults to standard trust models', () => {
    const trust = buildSolanaTrustConfig(mockRecord, MOCK_PROGRAM_ID, 'devnet');
    expect(trust.trustModels).toEqual(['feedback', 'inference-validation']);
  });
});
