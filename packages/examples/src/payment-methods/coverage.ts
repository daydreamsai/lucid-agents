export type PaymentMethodCoverage = {
  /** User-facing source that demonstrates configuration and entrypoints. */
  example: string;
  /** Tutorial that explains how to apply and verify the example. */
  tutorial: string;
  /** Executable contract or live lifecycle that proves the documented scope. */
  proof: string;
  /** Honest boundary of what the example proves. */
  scope: string;
};

/**
 * Example coverage keyed one-for-one to docs/payment-support-matrix.json.
 *
 * The test suite rejects missing or stale rows, so adding a payment method to
 * the product requires adding a discoverable example and executable proof.
 */
export const paymentMethodCoverage = {
  'x402-exact-evm': {
    example: 'packages/examples/src/payment-methods/x402.ts',
    tutorial: 'lucid-docs/content/docs/examples/x402-payment-methods.mdx',
    proof: 'packages/examples/src/__tests__/payment-method-examples.test.ts',
    scope: 'EVM exact offers, invoke/SSE/task projection, SIWX, and discovery',
  },
  'x402-exact-svm': {
    example: 'packages/examples/src/payment-methods/x402.ts',
    tutorial: 'lucid-docs/content/docs/examples/x402-payment-methods.mdx',
    proof: 'packages/examples/src/__tests__/payment-method-examples.test.ts',
    scope: 'Solana exact seller offer and public discovery/challenge shape',
  },
  'x402-upto-evm': {
    example: 'packages/examples/src/payment-methods/x402.ts',
    tutorial: 'lucid-docs/content/docs/examples/x402-payment-methods.mdx',
    proof: 'packages/examples/src/__tests__/smoke.test.ts',
    scope:
      'Invoke-only ceiling authorization and handler-reported actual usage',
  },
  'x402-batch-settlement-evm': {
    example: 'packages/examples/src/payment-methods/x402.ts',
    tutorial: 'lucid-docs/content/docs/examples/x402-payment-methods.mdx',
    proof: 'packages/examples/src/__tests__/x402-batch-lifecycle.test.ts',
    scope:
      'Seller configuration plus buyer/seller restart, race, claim, settle, and refund lifecycle',
  },
  'mpp-tempo-charge': {
    example: 'packages/examples/src/payment-methods/mpp.ts',
    tutorial: 'lucid-docs/content/docs/examples/mpp-payment-methods.mdx',
    proof: 'packages/examples/src/__tests__/tempo-localnet.e2e.ts',
    scope: 'Native mppx charge against a pinned real Tempo development node',
  },
  'mpp-tempo-session': {
    example: 'packages/examples/src/payment-methods/mpp.ts',
    tutorial: 'lucid-docs/content/docs/examples/mpp-payment-methods.mdx',
    proof: 'packages/examples/src/__tests__/tempo-localnet.e2e.ts',
    scope:
      'TIP-1034 invoke/SSE metering, top-up, SQLite restart, close, and settlement',
  },
  'mpp-stripe-charge': {
    example: 'packages/examples/src/payment-methods/mpp.ts',
    tutorial: 'lucid-docs/content/docs/examples/mpp-payment-methods.mdx',
    proof: 'packages/examples/src/__tests__/payment-method-examples.test.ts',
    scope:
      'Native Stripe charge configuration and public challenge/discovery contract; live settlement requires a Stripe sandbox',
  },
  'mpp-evm-charge': {
    example: 'packages/examples/src/payment-methods/mpp.ts',
    tutorial: 'lucid-docs/content/docs/examples/mpp-payment-methods.mdx',
    proof: 'packages/examples/src/__tests__/smoke.test.ts',
    scope:
      'Native MPP EVM and compatible x402 exact credential settlement with replay rejection',
  },
  'mpp-evm-session': {
    example: 'packages/examples/src/mpp/custom-verifier-reference.ts',
    tutorial: 'lucid-docs/content/docs/examples/mpp-payment-methods.mdx',
    proof: 'packages/examples/src/__tests__/custom-mpp-conformance.e2e.test.ts',
    scope:
      'Application-owned custom session extension only; no native EVM session is claimed',
  },
  'mpp-custom': {
    example: 'packages/examples/src/mpp/custom-verifier-reference.ts',
    tutorial: 'lucid-docs/content/docs/examples/mpp-payment-methods.mdx',
    proof: 'packages/examples/src/__tests__/custom-mpp-conformance.e2e.test.ts',
    scope:
      'Complete custom verifier, idempotent settlement, public HTTP conformance, and redaction',
  },
  'mpp-lightning': {
    example: 'packages/examples/src/payment-methods/mpp.ts',
    tutorial: 'lucid-docs/content/docs/examples/mpp-payment-methods.mdx',
    proof: 'packages/examples/src/__tests__/payment-method-examples.test.ts',
    scope:
      'Custom Lightning descriptor and challenge contract only; native node interoperability is not claimed',
  },
} as const satisfies Record<string, PaymentMethodCoverage>;
