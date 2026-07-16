import { describe, expect, it } from 'bun:test';
import { privateKeyToAccount } from 'viem/accounts';

import { createX402Fetch } from '../x402';

const account = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
);

describe('createX402Fetch network registration', () => {
  it('accepts canonical CAIP-2 EVM identifiers', () => {
    expect(() =>
      createX402Fetch({ account, networks: ['eip155:84532'] })
    ).not.toThrow();
  });

  it('rejects unsupported identifiers instead of silently registering nothing', () => {
    expect(() =>
      createX402Fetch({ account, networks: ['solana:mainnet'] })
    ).toThrow('Unsupported EVM payment network');
  });
});
