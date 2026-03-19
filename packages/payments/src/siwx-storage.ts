/**
 * SIWX storage interface for entitlements and nonces.
 * Mirrors the interface from @lucid-agents/types/siwx.
 * Defined locally until the types package exports it.
 */
export interface SIWxStorage {
  /**
   * Checks if a payment entitlement exists for a resource/address pair.
   * @param resource - The resource identifier
   * @param address - The wallet address (normalized to lowercase)
   */
  hasPaid(resource: string, address: string): Promise<boolean>;

  /**
   * Records a payment entitlement for a resource/address pair.
   * @param resource - The resource identifier
   * @param address - The wallet address (normalized to lowercase)
   * @param chainId - Optional chain ID for the payment network
   */
  recordPayment(
    resource: string,
    address: string,
    chainId?: string
  ): Promise<void>;

  /**
   * Checks if a nonce has already been used.
   * @param nonce - The nonce string to check
   */
  hasUsedNonce(nonce: string): Promise<boolean>;

  /**
   * Records a nonce as used.
   * @param nonce - The nonce string to record
   * @param metadata - Optional metadata for the nonce
   */
  recordNonce(
    nonce: string,
    metadata?: { resource?: string; address?: string; expiresAt?: number }
  ): Promise<void>;

  /**
   * Clears all entitlements and nonces.
   */
  clear(): Promise<void>;
}
