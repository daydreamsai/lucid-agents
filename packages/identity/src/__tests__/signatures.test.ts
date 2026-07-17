import type { SignerWalletClient } from '@lucid-agents/wallet';
import { describe, expect, it } from 'bun:test';
import { privateKeyToAccount } from 'viem/accounts';

import {
  buildAgentWalletTypedData,
  buildDomainProofMessage,
  buildValidationRequestMessage,
  hashValidationRequest,
  signAgentWalletProof,
  signDomainProof,
  signValidationRequest,
} from '../registries/signatures';

const account = privateKeyToAccount(
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
);
const walletClient = { account } as unknown as SignerWalletClient;

describe('buildAgentWalletTypedData', () => {
  it('builds typed data payload for agent wallet updates', () => {
    const typed = buildAgentWalletTypedData({
      agentId: 42n,
      newWallet: '0x000000000000000000000000000000000000beef',
      deadline: 123n,
      chainId: 84532,
      verifyingContract: '0x000000000000000000000000000000000000dEaD',
      name: 'ERC-8004 Identity Registry',
      version: '1',
    });

    expect(typed.primaryType).toBe('AgentWallet');
    expect(typed.domain.chainId).toBe(84532);
    expect(typed.message.agentId).toBe('42');
    expect(typed.message.newWallet).toBe(
      '0x000000000000000000000000000000000000beef'
    );
  });

  it('uses default typed-data domain fields', () => {
    const typed = buildAgentWalletTypedData({
      agentId: 1n,
      newWallet: '0x000000000000000000000000000000000000beef',
      deadline: 99n,
      chainId: 1,
      verifyingContract: '0x000000000000000000000000000000000000dEaD',
    });

    expect(typed.domain.name).toBe('ERC-8004 Identity Registry');
    expect(typed.domain.version).toBe('1');
    expect(typed.message.deadline).toBe('99');
  });

  it('builds and signs domain ownership proofs with optional nonces', async () => {
    const params = {
      domain: 'agent.example.com',
      address: account.address,
      chainId: 84532,
      nonce: 'nonce-1',
    };

    expect(buildDomainProofMessage(params)).toContain('Nonce: nonce-1');
    expect(
      buildDomainProofMessage({ ...params, nonce: undefined })
    ).not.toContain('Nonce:');
    expect(await signDomainProof(walletClient, params)).toMatch(
      /^0x[0-9a-f]+$/i
    );
  });

  it('hashes and signs validation requests', async () => {
    const requestHash = hashValidationRequest('request body');
    expect(
      hashValidationRequest(new TextEncoder().encode('request body'))
    ).toBe(requestHash);
    const params = {
      agentId: 42n,
      requestHash,
      validator: account.address,
      chainId: 84532,
      timestamp: 123,
    };

    expect(buildValidationRequestMessage(params)).toContain('Agent ID: 42');
    expect(await signValidationRequest(walletClient, params)).toMatch(
      /^0x[0-9a-f]+$/i
    );
  });

  it('signs agent wallet updates as EIP-712 typed data', async () => {
    expect(
      await signAgentWalletProof(walletClient, {
        agentId: 42n,
        newWallet: '0x000000000000000000000000000000000000beef',
        deadline: 123n,
        chainId: 84532,
        verifyingContract: '0x000000000000000000000000000000000000dEaD',
      })
    ).toMatch(/^0x[0-9a-f]+$/i);
  });
});
