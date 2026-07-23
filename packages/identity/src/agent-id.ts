/**
 * ERC-8004 identity uint256 token identifier accepted by bootstrap and
 * identity-registry APIs.
 *
 * Prefer a decimal string or bigint when the value may exceed JavaScript's
 * safe-integer range.
 */
export type IdentityAgentId = bigint | number | string;

const MAX_UINT256 = (1n << 256n) - 1n;

export function normalizeIdentityAgentId(agentId: IdentityAgentId): string {
  if (typeof agentId === 'bigint') {
    if (agentId < 0n) {
      throw new Error('agentId must be non-negative');
    }
    if (agentId > MAX_UINT256) {
      throw new Error('agentId must fit in an unsigned 256-bit integer');
    }
    return agentId.toString(10);
  }

  if (typeof agentId === 'number') {
    if (
      !Number.isFinite(agentId) ||
      !Number.isInteger(agentId) ||
      agentId < 0
    ) {
      throw new Error('agentId must be a non-negative integer');
    }
    if (!Number.isSafeInteger(agentId)) {
      throw new Error(
        'agentId number must be a safe integer; use string or bigint for larger values'
      );
    }
    return agentId.toString(10);
  }

  const normalized = agentId.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error('agentId must be a non-negative base-10 integer');
  }
  const parsed = BigInt(normalized);
  if (parsed > MAX_UINT256) {
    throw new Error('agentId must fit in an unsigned 256-bit integer');
  }
  return parsed.toString(10);
}
