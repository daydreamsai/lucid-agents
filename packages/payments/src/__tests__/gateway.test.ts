import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

// ============================================================================
// Mock modules BEFORE any imports that use them
// ============================================================================

const mockVerify = mock(() =>
  Promise.resolve({ isValid: true, payer: '0xBuyer' })
);
const mockSettle = mock(() =>
  Promise.resolve({
    success: true,
    payer: '0xBuyer',
    transaction: '0xSettleTx',
    network: 'eip155:8453',
  })
);
const mockGetSupported = mock(() =>
  Promise.resolve({
    kinds: [
      {
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:8453',
        extra: {
          name: 'GatewayWalletBatched',
          version: '1',
          verifyingContract: '0xGatewayWallet',
        },
      },
    ],
    extensions: [],
    signers: {},
  })
);

const mockDeposit = mock(() =>
  Promise.resolve({
    depositTxHash: '0xDepositTx',
    approvalTxHash: '0xApprovalTx',
    formattedAmount: '10.00',
    depositor: '0xTestAddress',
    amount: 10000000n,
  })
);

const mockRegister = mock(() => {});

mock.module('@circle-fin/x402-batching/server', () => ({
  BatchFacilitatorClient: class MockBatchFacilitatorClient {
    url: string;
    constructor(config?: { url?: string }) {
      this.url = config?.url ?? 'https://gateway.circle.com';
    }
    verify = mockVerify;
    settle = mockSettle;
    getSupported = mockGetSupported;
  },
  isBatchPayment: (req: any) =>
    req?.extra?.name === 'GatewayWalletBatched',
}));

mock.module('@circle-fin/x402-batching/client', () => ({
  BatchEvmScheme: class MockBatchEvmScheme {
    scheme = 'exact';
    constructor(public signer: any) {}
    createPaymentPayload = mock(() =>
      Promise.resolve({ x402Version: 2, payload: { type: 'batch' } })
    );
  },
  registerBatchScheme: mockRegister,
  GatewayClient: class MockGatewayClient {
    chainConfig: any;
    address = '0xTestAddress';
    constructor(config: any) {
      this.chainConfig = { chain: config.chain };
    }
    deposit = mockDeposit;
    getBalances = mock(() =>
      Promise.resolve({
        wallet: { balance: 100000000n, formatted: '100.00' },
        gateway: {
          total: 50000000n,
          available: 50000000n,
          withdrawing: 0n,
          withdrawable: 0n,
        },
      })
    );
  },
  CompositeEvmScheme: class MockCompositeEvmScheme {
    scheme = 'exact';
    constructor(public batchScheme: any, public fallbackScheme: any) {}
  },
}));

mock.module('viem/accounts', () => ({
  privateKeyToAccount: (key: string) => ({
    address: '0xTestAddress',
    publicKey: '0xPubKey',
    signMessage: mock(() => Promise.resolve('0xSig')),
    signTransaction: mock(() => Promise.resolve('0xTx')),
    signTypedData: mock(() => Promise.resolve('0xTypedSig')),
    type: 'local' as const,
  }),
}));

mock.module('@x402/evm', () => ({
  ExactEvmScheme: class MockExactEvmScheme {
    scheme = 'exact';
    constructor(public signer: any) {}
  },
  toClientEvmSigner: (account: any) => account,
}));

const mockPaymentFetch = mock(
  (_input: any, _init: any) =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'PAYMENT-RESPONSE': 'paid' },
      })
    )
);

mock.module('@x402/fetch', () => ({
  wrapFetchWithPayment: (_fetch: any, _client: any) => mockPaymentFetch,
  x402Client: class Mockx402Client {
    register = mock(() => {});
  },
}));

// ============================================================================
// Environment helpers
// ============================================================================

const GATEWAY_ENV_KEYS = [
  'CIRCLE_GATEWAY_FACILITATOR',
  'CIRCLE_GATEWAY_CHAIN',
  'FACILITATOR_URL',
  'NETWORK',
  'PAYMENTS_FACILITATOR_URL',
  'PAYMENTS_NETWORK',
  'PAYMENTS_RECEIVABLE_ADDRESS',
  'PRIVATE_KEY',
] as const;

const originalEnv: Record<string, string | undefined> = {};

function saveEnv() {
  for (const key of GATEWAY_ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }
}

function resetEnv() {
  for (const key of GATEWAY_ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Circle Gateway Integration', () => {
  beforeEach(() => {
    saveEnv();
  });

  afterEach(() => {
    resetEnv();
  });

  // --------------------------------------------------------------------------
  // Facilitator tests
  // --------------------------------------------------------------------------

  describe('createCircleGatewayFacilitator', () => {
    it('creates a BatchFacilitatorClient with default URL', async () => {
      const { createCircleGatewayFacilitator } = await import(
        '../gateway/facilitator'
      );
      const facilitator = await createCircleGatewayFacilitator();
      expect(facilitator).toBeDefined();
      expect(facilitator.url).toBe('https://gateway.circle.com');
    });

    it('creates a BatchFacilitatorClient with custom URL', async () => {
      const { createCircleGatewayFacilitator } = await import(
        '../gateway/facilitator'
      );
      const facilitator = await createCircleGatewayFacilitator({
        facilitatorUrl: 'https://custom-gateway.example.com',
      });
      expect(facilitator.url).toBe('https://custom-gateway.example.com');
    });

    it('facilitator.verify() returns valid response', async () => {
      const { createCircleGatewayFacilitator } = await import(
        '../gateway/facilitator'
      );
      const facilitator = await createCircleGatewayFacilitator();
      const result = await facilitator.verify(
        { x402Version: 2, payload: {} } as any,
        {
          scheme: 'exact',
          network: 'eip155:8453',
          amount: '1000',
          payTo: '0xSeller',
          asset: 'USDC',
          maxTimeoutSeconds: 30,
        } as any
      );
      expect(result.isValid).toBe(true);
      expect(result.payer).toBe('0xBuyer');
    });

    it('facilitator.settle() returns success with transaction', async () => {
      const { createCircleGatewayFacilitator } = await import(
        '../gateway/facilitator'
      );
      const facilitator = await createCircleGatewayFacilitator();
      const result = await facilitator.settle(
        { x402Version: 2, payload: {} } as any,
        {
          scheme: 'exact',
          network: 'eip155:8453',
          amount: '1000',
          payTo: '0xSeller',
          asset: 'USDC',
          maxTimeoutSeconds: 30,
        } as any
      );
      expect(result.success).toBe(true);
      expect(result.transaction).toBe('0xSettleTx');
      expect(result.network).toBe('eip155:8453');
    });

    it('facilitator.getSupported() includes GatewayWalletBatched', async () => {
      const { createCircleGatewayFacilitator } = await import(
        '../gateway/facilitator'
      );
      const facilitator = await createCircleGatewayFacilitator();
      const supported = await facilitator.getSupported();
      expect(supported.kinds).toHaveLength(1);
      expect(supported.kinds[0].extra?.name).toBe('GatewayWalletBatched');
      expect(supported.kinds[0].extra?.verifyingContract).toBe(
        '0xGatewayWallet'
      );
    });
  });

  // --------------------------------------------------------------------------
  // Gateway fetch tests
  // --------------------------------------------------------------------------

  describe('createGatewayFetch', () => {
    it('creates a wrapped fetch function', async () => {
      const { createGatewayFetch } = await import('../gateway/fetch');
      const gFetch = await await createGatewayFetch({
        privateKey:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        chain: 'base',
      });
      expect(typeof gFetch).toBe('function');
      expect(typeof gFetch.preconnect).toBe('function');
    });

    it('throws without privateKey', async () => {
      const { createGatewayFetch } = await import('../gateway/fetch');
      expect(createGatewayFetch({ privateKey: '' })).rejects.toThrow(
        'requires a privateKey'
      );
    });

    it('defaults chain to base', async () => {
      const { createGatewayFetch } = await import('../gateway/fetch');
      const gFetch = await await createGatewayFetch({
        privateKey:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      });
      expect(gFetch).toBeDefined();
    });

    it('registers batch scheme with registerBatchScheme', async () => {
      mockRegister.mockClear();
      const { createGatewayFetch } = await import('../gateway/fetch');
      await createGatewayFetch({
        privateKey:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        chain: 'base',
      });
      expect(mockRegister).toHaveBeenCalled();
    });

    it('fetch makes request and returns response', async () => {
      const { createGatewayFetch } = await import('../gateway/fetch');
      const gFetch = await await createGatewayFetch({
        privateKey:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      });
      const response = await gFetch('https://api.example.com/test');
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);
    });

    it('fetch detects payment response header', async () => {
      const { createGatewayFetch } = await import('../gateway/fetch');
      const gFetch = await await createGatewayFetch({
        privateKey:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      });
      const response = await gFetch('https://api.example.com/paid');
      expect(response.headers.get('PAYMENT-RESPONSE')).toBe('paid');
    });
  });

  // --------------------------------------------------------------------------
  // Deposit tests
  // --------------------------------------------------------------------------

  describe('depositToGateway', () => {
    it('deposits USDC into Gateway', async () => {
      const { depositToGateway } = await import('../gateway/deposit');
      const result = await depositToGateway({
        privateKey:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        amount: '10.00',
        chain: 'base',
      });
      expect(result.depositTxHash).toBe('0xDepositTx');
      expect(result.approvalTxHash).toBe('0xApprovalTx');
      expect(result.amount).toBe('10.00');
      expect(result.depositor).toBe('0xTestAddress');
    });

    it('throws without privateKey', async () => {
      const { depositToGateway } = await import('../gateway/deposit');
      await expect(
        depositToGateway({ privateKey: '', amount: '10', chain: 'base' })
      ).rejects.toThrow('requires a privateKey');
    });

    it('throws with zero amount', async () => {
      const { depositToGateway } = await import('../gateway/deposit');
      await expect(
        depositToGateway({
          privateKey:
            '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          amount: '0',
        })
      ).rejects.toThrow('requires a positive numeric amount');
    });

    it('throws with negative amount', async () => {
      const { depositToGateway } = await import('../gateway/deposit');
      await expect(
        depositToGateway({
          privateKey:
            '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          amount: '-5',
        })
      ).rejects.toThrow('requires a positive numeric amount');
    });

    it('throws with empty amount', async () => {
      const { depositToGateway } = await import('../gateway/deposit');
      await expect(
        depositToGateway({
          privateKey:
            '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          amount: '',
        })
      ).rejects.toThrow('requires a positive numeric amount');
    });

    it('calls GatewayClient.deposit with correct amount', async () => {
      mockDeposit.mockClear();
      const { depositToGateway } = await import('../gateway/deposit');
      await depositToGateway({
        privateKey:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        amount: '25.50',
        chain: 'base-sepolia',
      });
      expect(mockDeposit).toHaveBeenCalledWith('25.50');
    });
  });

  // --------------------------------------------------------------------------
  // paymentsFromEnv Gateway tests
  // --------------------------------------------------------------------------

  describe('paymentsFromEnv with Gateway', () => {
    it('includes facilitator field when CIRCLE_GATEWAY_FACILITATOR=true', async () => {
      process.env.CIRCLE_GATEWAY_FACILITATOR = 'true';
      process.env.FACILITATOR_URL = 'https://facilitator.example.com';
      process.env.NETWORK = 'eip155:8453';
      process.env.PAYMENTS_RECEIVABLE_ADDRESS = '0xSeller';

      const { paymentsFromEnv } = await import('../utils');
      const config = paymentsFromEnv();
      expect((config as any).facilitator).toBe('circle-gateway');
    });

    it('includes circleGatewayChain from env', async () => {
      process.env.CIRCLE_GATEWAY_FACILITATOR = 'true';
      process.env.CIRCLE_GATEWAY_CHAIN = 'base-sepolia';
      process.env.FACILITATOR_URL = 'https://facilitator.example.com';
      process.env.NETWORK = 'eip155:8453';
      process.env.PAYMENTS_RECEIVABLE_ADDRESS = '0xSeller';

      const { paymentsFromEnv } = await import('../utils');
      const config = paymentsFromEnv();
      expect((config as any).circleGatewayChain).toBe('base-sepolia');
    });

    it('defaults circleGatewayChain to base', async () => {
      process.env.CIRCLE_GATEWAY_FACILITATOR = 'true';
      delete process.env.CIRCLE_GATEWAY_CHAIN;
      process.env.FACILITATOR_URL = 'https://facilitator.example.com';
      process.env.NETWORK = 'eip155:8453';
      process.env.PAYMENTS_RECEIVABLE_ADDRESS = '0xSeller';

      const { paymentsFromEnv } = await import('../utils');
      const config = paymentsFromEnv();
      expect((config as any).circleGatewayChain).toBe('base');
    });

    it('does not include facilitator when env not set', async () => {
      delete process.env.CIRCLE_GATEWAY_FACILITATOR;
      process.env.FACILITATOR_URL = 'https://facilitator.example.com';
      process.env.NETWORK = 'eip155:8453';
      process.env.PAYMENTS_RECEIVABLE_ADDRESS = '0xSeller';

      const { paymentsFromEnv } = await import('../utils');
      const config = paymentsFromEnv();
      expect((config as any).facilitator).toBeUndefined();
    });

    it('standard x402 unaffected when Circle not configured', async () => {
      delete process.env.CIRCLE_GATEWAY_FACILITATOR;
      process.env.FACILITATOR_URL = 'https://standard.example.com';
      process.env.NETWORK = 'eip155:8453';
      process.env.PAYMENTS_RECEIVABLE_ADDRESS = '0xSeller';

      const { paymentsFromEnv } = await import('../utils');
      const config = paymentsFromEnv();
      expect(config.facilitatorUrl).toBe('https://standard.example.com');
      expect(config.network).toBe('eip155:8453');
      expect((config as any).facilitator).toBeUndefined();
      expect((config as any).circleGatewayChain).toBeUndefined();
    });

    it('accepts facilitator override via config', async () => {
      delete process.env.CIRCLE_GATEWAY_FACILITATOR;
      process.env.FACILITATOR_URL = 'https://facilitator.example.com';
      process.env.NETWORK = 'eip155:8453';

      const { paymentsFromEnv } = await import('../utils');
      const config = paymentsFromEnv({
        facilitator: 'circle-gateway',
        payTo: '0xSeller',
      } as any);
      expect((config as any).facilitator).toBe('circle-gateway');
    });
  });

  // --------------------------------------------------------------------------
  // Export tests
  // --------------------------------------------------------------------------

  describe('exports', () => {
    it('re-exports gateway types from index', async () => {
      const mod = await import('../index');
      expect(mod.createCircleGatewayFacilitator).toBeDefined();
      expect(mod.createGatewayFetch).toBeDefined();
      expect(mod.depositToGateway).toBeDefined();
    });

    it('x402 module exports GatewayFetchOptions type but not createGatewayFetch value', async () => {
      const mod = await import('../x402');
      // createGatewayFetch was moved to direct import from gateway/fetch
      expect(mod.createGatewayFetch).toBeUndefined();
    });

    it('payments extension accepts facilitator option', async () => {
      const mod = await import('../extension');
      expect(mod.payments).toBeDefined();
      // Should not throw with facilitator option
      const ext = mod.payments({
        config: {
          facilitatorUrl: 'https://test.com',
          network: 'eip155:8453',
          payTo: '0xSeller' as `0x${string}`,
          facilitator: 'circle-gateway',
        },
      });
      expect(ext.name).toBe('payments');
    });
  });
});
