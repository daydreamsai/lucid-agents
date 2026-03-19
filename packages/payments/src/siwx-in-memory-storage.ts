import type { SIWxStorage } from './siwx-storage';

/**
 * In-memory SIWX storage using Map and Set data structures.
 * Data is ephemeral (lost on restart/invocation).
 * Useful for testing, development, and serverless without persistence.
 */
export class InMemorySIWxStorage implements SIWxStorage {
  private entitlements: Map<
    string,
    { chainId?: string; paidAt: number }
  > = new Map();
  private nonces: Map<
    string,
    {
      resource?: string;
      address?: string;
      usedAt: number;
      expiresAt?: number;
    }
  > = new Map();

  private entitlementKey(resource: string, address: string): string {
    return `${resource}:${address.toLowerCase()}`;
  }

  async hasPaid(resource: string, address: string): Promise<boolean> {
    return Promise.resolve(
      this.entitlements.has(this.entitlementKey(resource, address))
    );
  }

  async recordPayment(
    resource: string,
    address: string,
    chainId?: string
  ): Promise<void> {
    this.entitlements.set(this.entitlementKey(resource, address), {
      chainId,
      paidAt: Date.now(),
    });
    return Promise.resolve();
  }

  async hasUsedNonce(nonce: string): Promise<boolean> {
    return Promise.resolve(this.nonces.has(nonce));
  }

  async recordNonce(
    nonce: string,
    metadata?: { resource?: string; address?: string; expiresAt?: number }
  ): Promise<void> {
    this.nonces.set(nonce, {
      resource: metadata?.resource,
      address: metadata?.address,
      usedAt: Date.now(),
      expiresAt: metadata?.expiresAt,
    });
    return Promise.resolve();
  }

  async consumeNonce(
    nonce: string,
    metadata?: { resource?: string; address?: string; expiresAt?: number }
  ): Promise<'consumed' | 'already_used'> {
    if (this.nonces.has(nonce)) {
      return 'already_used';
    }
    this.nonces.set(nonce, {
      resource: metadata?.resource,
      address: metadata?.address,
      usedAt: Date.now(),
      expiresAt: metadata?.expiresAt,
    });
    return 'consumed';
  }

  async clear(): Promise<void> {
    this.entitlements.clear();
    this.nonces.clear();
    return Promise.resolve();
  }
}

/**
 * Creates a new in-memory SIWX storage instance.
 * @returns A new InMemorySIWxStorage instance
 */
export function createInMemorySIWxStorage(): SIWxStorage {
  return new InMemorySIWxStorage();
}
