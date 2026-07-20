import { x402Client } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { wrapFetchWithPayment } from '@x402/fetch';
import { privateKeyToAccount } from 'viem/accounts';

export type PaidFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export function createPaidFetch(
  privateKey: `0x${string}`,
  fetchImpl: typeof fetch = fetch
): PaidFetch {
  const client = new x402Client();
  registerExactEvmScheme(client, {
    signer: privateKeyToAccount(privateKey),
    networks: ['eip155:84532'],
  });
  return wrapFetchWithPayment(fetchImpl, client);
}
