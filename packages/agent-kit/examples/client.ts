import {
  decodeXPaymentResponse,
  wrapFetchWithPayment,
  createSigner,
  type Hex,
} from 'x402-fetch';

const privateKey = process.env.PRIVATE_KEY as Hex | string;

const url = `http://localhost:8788/entrypoints/buffett-signal/invoke`;

async function once(): Promise<void> {
  // const signer = await createSigner("solana-devnet", privateKey); // uncomment for solana
  const signer = await createSigner('base', privateKey);
  const fetchWithPayment = wrapFetchWithPayment(
    fetch,
    signer,
    BigInt(1 * 10 ** 6)
  );

  const response = await fetchWithPayment(url, {
    method: 'POST',
    body: JSON.stringify({
      input: {
        tickers: ['TSLA'],
      },
    }),
  });
  const body = await response.json();
  console.log(`[${new Date().toISOString()}]`, body);

  // const paymentResponse = decodeXPaymentResponse(
  //   response.headers.get("x-payment-response")!
  // );
  // console.log(paymentResponse);
}

async function mainLoop(): Promise<void> {
  while (true) {
    try {
      await once();
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}]`,
        error?.response?.data?.error ?? error
      );
    }
    await new Promise(resolve => setTimeout(resolve, 60_000));
  }
}

mainLoop().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
