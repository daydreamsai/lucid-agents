import { base58 } from '@scure/base';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm';
import { decodePaymentResponseHeader, wrapFetchWithPayment } from '@x402/fetch';
import { ExactSvmScheme } from '@x402/svm';
import { privateKeyToAccount } from 'viem/accounts';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const evmUrl = required('X402_SANDBOX_EVM_URL');
const solanaUrl = required('X402_SANDBOX_SOLANA_URL');
const evmKey = required('X402_SANDBOX_EVM_PRIVATE_KEY') as `0x${string}`;
const solanaKey = required('X402_SANDBOX_SOLANA_PRIVATE_KEY_BASE58');

const evmSigner = privateKeyToAccount(evmKey);
const solanaSigner = await createKeyPairSignerFromBytes(
  base58.decode(solanaKey)
);
const client = new x402Client()
  .register('eip155:*', new ExactEvmScheme(evmSigner))
  .register(
    'solana:*',
    new ExactSvmScheme(solanaSigner, {
      rpcUrl: process.env.X402_SANDBOX_SOLANA_RPC_URL,
    })
  );
const paidFetch = wrapFetchWithPayment(fetch, client);

for (const [lane, url] of [
  ['evm', evmUrl],
  ['solana', solanaUrl],
] as const) {
  const idempotencyKey = `pay_${lane}0123456789abcdef`;
  const response = await paidFetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({ input: { prompt: `sandbox-${lane}` } }),
  });
  if (!response.ok) {
    throw new Error(`${lane} sandbox failed with HTTP ${response.status}`);
  }
  const receipt = response.headers.get('PAYMENT-RESPONSE');
  if (!receipt) throw new Error(`${lane} sandbox returned no PAYMENT-RESPONSE`);
  const decoded = decodePaymentResponseHeader(receipt);
  console.log(
    JSON.stringify({
      lane,
      status: response.status,
      transaction: decoded?.transaction,
      network: decoded?.network,
      // Never print keys, signatures, or bearer credentials.
    })
  );
}
