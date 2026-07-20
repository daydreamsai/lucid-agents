import { createPaidFetch } from './buyer-client';

const privateKey = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey) throw new Error('BUYER_PRIVATE_KEY is required');

const paidFetch = createPaidFetch(privateKey);

const response = await paidFetch(
  'http://localhost:3000/entrypoints/analyze/invoke',
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      input: { text: 'machine commerce works' },
    }),
  }
);

if (!response.ok) throw new Error(`Paid call failed: ${response.status}`);

console.log({
  result: await response.json(),
  settlement: response.headers.get('PAYMENT-RESPONSE'),
});
