import { describe, expect, it } from 'bun:test';

import {
  getRegistryAddress,
  getRegistryAddresses,
  isChainSupported,
  isERC8004Registry,
} from '../config/erc8004';

describe('ERC-8004 registry configuration', () => {
  it('resolves each registry for supported chains', () => {
    const addresses = getRegistryAddresses(84532);

    expect(getRegistryAddress('identity', 84532)).toBe(
      addresses.IDENTITY_REGISTRY
    );
    expect(getRegistryAddress('reputation', 84532)).toBe(
      addresses.REPUTATION_REGISTRY
    );
    expect(getRegistryAddress('validation', 84532)).toBe(
      addresses.VALIDATION_REGISTRY
    );
    expect(isChainSupported(84532)).toBe(true);
    expect(isChainSupported(999)).toBe(false);
  });

  it('rejects unsupported chain lookups with deployment guidance', () => {
    expect(() => getRegistryAddresses(999)).toThrow(
      'Chain ID 999 is not supported. Supported chains: 1, 84532, 11155111.'
    );
  });

  it('recognizes registry addresses on a selected chain or any chain', () => {
    const identity = getRegistryAddress('identity', 84532);
    const unknown = '0x0000000000000000000000000000000000001234';

    expect(isERC8004Registry(identity, 84532)).toBe(true);
    expect(isERC8004Registry(identity.toLowerCase() as typeof identity)).toBe(
      true
    );
    expect(isERC8004Registry(identity, 999)).toBe(false);
    expect(isERC8004Registry(unknown)).toBe(false);
  });
});
