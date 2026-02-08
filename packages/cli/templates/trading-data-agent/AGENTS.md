# Trading Data Agent - AI Implementation Guide

This template creates a merchant agent that sells trading data via A2A.

## Architecture

**Role**: Merchant agent (receives payments)

**Capabilities**:
- Provides mock trading data
- Priced entrypoints (x402 payments)
- AP2 merchant role enabled

## Key Concepts

### 1. Priced Entrypoints

Entrypoints can specify a `price` field:

```typescript
addEntrypoint({
  key: 'getMarketData',
  price: '5000', // Price in base units
  // ...
});
```

When another agent calls this entrypoint with payment-enabled fetch, the payment is automatically processed via x402.

### 2. Payment Configuration

The agent receives payments via x402:

```typescript
const appOptions = {
  payments: {
    facilitatorUrl: process.env.PAYMENTS_FACILITATOR_URL,
    facilitatorAuth: process.env.PAYMENTS_FACILITATOR_AUTH,
    payTo: process.env.PAYMENTS_RECEIVABLE_ADDRESS,
    network: process.env.PAYMENTS_NETWORK,
  },
  ap2: { roles: ['merchant'], required: true },
};
```

### 3. Mock Data Generation

The agent generates realistic mock trading data:

- OHLCV (Open/High/Low/Close/Volume) candles
- Time-based data points
- Random price variations

## Customization

### Adding More Data Endpoints

Add new priced entrypoints:

```typescript
addEntrypoint({
  key: 'getHistoricalData',
  price: '10000',
  input: z.object({ /* ... */ }),
  output: z.object({ /* ... */ }),
  handler: async ctx => {
    // Your data generation logic
  },
});
```

### Real Data Integration

Replace mock data with real API calls:

```typescript
handler: async ctx => {
  const data = await fetchRealMarketData(ctx.input.symbol);
  return { output: data };
},
```

## Next Steps

- Connect to real market data APIs
- Add more data endpoints (indicators, order book, etc.)
- Implement streaming for real-time data
- Add data caching for performance
