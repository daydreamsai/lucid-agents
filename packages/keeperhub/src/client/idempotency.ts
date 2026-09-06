import type {
  CanonicalContractCallBody,
  CanonicalTransferBody,
  ChainInput,
  ContractCallRequest,
  TransferRequest,
} from './types';

/**
 * Canonicalisation rules from KeeperHub's "Choosing a stable key" section
 * (https://docs.keeperhub.com/api/direct-execution#choosing-a-stable-key).
 * The same rules shape the request body, so a retry replays instead of conflicting.
 */

const CHAIN_ALIASES: Readonly<Record<string, string>> = {
  ethereum: '1',
  mainnet: '1',
  sepolia: '11155111',
  'ethereum-sepolia': '11155111',
  base: '8453',
  'base-sepolia': '84532',
  arbitrum: '42161',
  'arbitrum-one': '42161',
  'arbitrum-sepolia': '421614',
  optimism: '10',
  polygon: '137',
  'polygon-amoy': '80002',
};

/** Decimal chain id with no leading zeros. Known names resolve; unknown names throw. */
export function canonicalChainId(chain: ChainInput): string {
  if (typeof chain === 'number') {
    if (!Number.isInteger(chain) || chain < 0) {
      throw new Error(`invalid chain id: ${chain}`);
    }
    return String(chain);
  }
  const s = chain.trim();
  if (/^\d+$/.test(s)) {
    return BigInt(s).toString();
  }
  const alias = CHAIN_ALIASES[s.toLowerCase()];
  if (!alias) {
    throw new Error(`unknown chain "${chain}"; pass a numeric chain id`);
  }
  return alias;
}

/** Plain decimal string: no sign, no exponent, no leading zeros, no trailing zeros. */
export function canonicalAmount(input: string): string {
  const s = input.trim();
  if (s === '') {
    throw new Error('amount is empty');
  }
  if (s.startsWith('+') || s.startsWith('-')) {
    throw new Error(`amount must be unsigned: "${input}"`);
  }
  if (!/^\d*(\.\d*)?$/.test(s) || s === '.') {
    throw new Error(`amount is not a plain decimal: "${input}"`);
  }
  const [intPart = '', fracPart = ''] = s.split('.');
  let int = intPart.replace(/^0+/, '');
  const frac = fracPart.replace(/0+$/, '');
  if (int === '') {
    int = '0';
  }
  return frac ? `${int}.${frac}` : int;
}

/** Percent-encode the two characters that would break the joined material. */
export function encodeTaskId(taskId: string): string {
  return taskId.trim().replace(/%/g, '%25').replace(/\|/g, '%7C');
}

/** Lowercase 0x-prefixed EVM address. Lowercase always passes KeeperHub's EIP-55 check. */
export function normalizeAddress(address: string): string {
  const s = address.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) {
    throw new Error(`invalid EVM address: "${address}"`);
  }
  return s.toLowerCase();
}

export interface TransferKeyInput {
  /** The caller's own stable id for the work: invoice number, task id, payroll period. */
  taskId: string;
  chainId: ChainInput;
  recipientAddress: string;
  amount: string;
  tokenAddress?: string | undefined;
}

/** The pre-hash string `taskId|chainId|recipient|amount|token`, exactly as KeeperHub documents it. */
export function transferKeyMaterial(input: TransferKeyInput): string {
  return [
    encodeTaskId(input.taskId),
    canonicalChainId(input.chainId),
    normalizeAddress(input.recipientAddress),
    canonicalAmount(input.amount),
    input.tokenAddress ? normalizeAddress(input.tokenAddress) : '',
  ].join('|');
}

/** SHA-256 of the material, lowercase hex: the value to send as `Idempotency-Key`. */
export function deriveTransferKey(input: TransferKeyInput): Promise<string> {
  return sha256Hex(transferKeyMaterial(input));
}

export interface ContractCallKeyInput {
  taskId: string;
  chainId: ChainInput;
  contractAddress: string;
  functionName: string;
  functionArgs?: string | undefined;
  value?: string | undefined;
}

/**
 * Landed's extension of the rule to contract calls:
 * `taskId|chainId|contract|function|args|value`. Args are kept verbatim (they are opaque JSON).
 */
export function contractCallKeyMaterial(input: ContractCallKeyInput): string {
  return [
    encodeTaskId(input.taskId),
    canonicalChainId(input.chainId),
    normalizeAddress(input.contractAddress),
    input.functionName.trim(),
    input.functionArgs?.trim() ?? '',
    input.value ? canonicalAmount(input.value) : '',
  ].join('|');
}

export function deriveContractCallKey(
  input: ContractCallKeyInput
): Promise<string> {
  return sha256Hex(contractCallKeyMaterial(input));
}

export async function sha256Hex(material: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(material)
  );
  return Array.from(new Uint8Array(digest), b =>
    b.toString(16).padStart(2, '0')
  ).join('');
}

/** One spelling per value so that the body hash KeeperHub stores matches on a retry. */
export function canonicalTransferBody(
  req: TransferRequest
): CanonicalTransferBody {
  const body: CanonicalTransferBody = {
    chainId: canonicalChainId(req.chainId),
    recipientAddress: normalizeAddress(req.recipientAddress),
    amount: canonicalAmount(req.amount),
  };
  if (req.tokenAddress) {
    body.tokenAddress = normalizeAddress(req.tokenAddress);
  }
  if (req.tokenConfig) {
    body.tokenConfig = req.tokenConfig;
  }
  if (req.gasLimitMultiplier) {
    body.gasLimitMultiplier = canonicalAmount(req.gasLimitMultiplier);
  }
  return body;
}

export function canonicalContractCallBody(
  req: ContractCallRequest
): CanonicalContractCallBody {
  const body: CanonicalContractCallBody = {
    chainId: canonicalChainId(req.chainId),
    contractAddress: normalizeAddress(req.contractAddress),
    functionName: req.functionName.trim(),
  };
  if (req.functionArgs !== undefined) {
    body.functionArgs = req.functionArgs.trim();
  }
  if (req.abi !== undefined) {
    body.abi = req.abi;
  }
  if (req.value !== undefined) {
    body.value = canonicalAmount(req.value);
  }
  if (req.gasLimitMultiplier) {
    body.gasLimitMultiplier = canonicalAmount(req.gasLimitMultiplier);
  }
  return body;
}
