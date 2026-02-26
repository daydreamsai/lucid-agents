# Configuration Guide

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3002` |
| `PAYTO_ADDRESS` | Ethereum address for payments | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| `NETWORK` | Blockchain network (CAIP-2) | `eip155:84532` (Base Sepolia) |
| `FACILITATOR_URL` | x402 facilitator URL | `https://facilitator.daydreams.systems` |

## Pricing

```typescript
addEntrypoint({ key: 'score', price: '0.10' });           // $0.10
addEntrypoint({ key: 'lead-time-forecast', price: '0.25' }); // $0.25
addEntrypoint({ key: 'disruption-alerts', price: '0.50' });  // $0.50
```

## Supported Networks

| Network | CAIP-2 ID |
|---------|-----------|
| Base Sepolia | `eip155:84532` |
| Base Mainnet | `eip155:8453` |
| Ethereum | `eip155:1` |

## Freshness Threshold

Default: 24 hours. Configure in `SupplierDataService`:

```typescript
const service = new SupplierDataService(60 * 60 * 1000); // 1 hour
```

## Production

```bash
# .env.production
PORT=3002
PAYTO_ADDRESS=0xYourWallet
NETWORK=eip155:8453
FACILITATOR_URL=https://facilitator.daydreams.systems
```
