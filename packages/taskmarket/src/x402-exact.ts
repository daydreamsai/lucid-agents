import { BASE_USDC_ADDRESS } from './constants';
import type { TaskmarketAccount, X402Accept } from './types';
import { chainIdFromNetwork } from './payment-required';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(bytes).toString('base64');
}

function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function signExactEvmPayment(args: {
  account: TaskmarketAccount;
  offer: X402Accept;
  resource?: string;
  now: () => number;
}): Promise<string> {
  const nowSeconds = Math.floor(args.now() / 1000);
  const timeout = Math.min(args.offer.maxTimeoutSeconds ?? 300, 300);
  const validBefore = nowSeconds + Math.max(timeout - 20, 30);
  const nonce = randomNonce();
  const domainName = args.offer.extra?.name ?? 'USD Coin';
  const domainVersion = String(args.offer.extra?.version ?? '2');
  const verifyingContract = args.offer.asset as `0x${string}`;
  const authorization = {
    from: args.account.address,
    to: args.offer.payTo as `0x${string}`,
    value: BigInt(args.offer.amount),
    validAfter: 0n,
    validBefore: BigInt(validBefore),
    nonce,
  };
  const signature = await args.account.signTypedData({
    domain: {
      name: domainName,
      version: domainVersion,
      chainId: chainIdFromNetwork(args.offer.network),
      verifyingContract:
        verifyingContract.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase()
          ? BASE_USDC_ADDRESS
          : verifyingContract,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  });
  const payload = {
    x402Version: 2,
    resource: args.resource,
    accepted: args.offer,
    payload: {
      signature,
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce,
      },
    },
  };
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)));
}
