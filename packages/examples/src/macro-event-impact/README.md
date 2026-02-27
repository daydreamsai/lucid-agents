# Macro Event Impact Vector API for Agents

A paid macro-data API that provides event-normalized impact vectors for sectors, assets, and supply chains. Built with TDD following the Lucid Agents framework.

## Overview

This API enables decision agents to translate macro events into machine-usable impact signals for automated hedging and reallocation strategies.

## Features

- **Macro Event Feed**: Filtered event data with freshness metadata
- **Impact Vectors**: Sector-level impact analysis with confidence scores
- **Scenario Scoring**: Custom scenario analysis with confidence bands
- **x402 Payment Integration**: All endpoints require payment via x402 protocol
- **Strict Validation**: Zod schemas for all inputs and outputs
- **Performance**: P95 response time <= 500ms for cached paths

## API Endpoints

### GET /v1/macro/events

Returns filtered macro event feed with freshness metadata.

**Price**: $0.01 per call

**Request**:
```json
{
  "eventTypes": ["interest_rate", "gdp"],
  "geography": "US",
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-12-31T23:59:59Z"
}
```

**Response**:
```json
{
  "event_feed": [
    {
      "eventId": "evt_123",
      "eventType": "interest_rate",
      "title": "Fed Rate Decision",
      "geography": "US",
      "timestamp": "2024-01-15T10:00:00Z",
      "confidence": 0.95,
      "freshness": {
        "dataTimestamp": "2024-01-15T10:00:00Z",
        "ageSeconds": 300
      }
    }
  ]
}
```

### GET /v1/macro/impact-vectors

Returns impact vector for a specific macro event.

**Price**: $0.02 per call

**Request**:
```json
{
  "eventId": "evt_123",
  "sectorSet": ["tech", "finance"],
  "horizon": "medium"
}
```

**Response**:
```json
{
  "eventId": "evt_123",
  "sectors": [
    {
      "sector": "tech",
      "impact": -0.3,
      "confidence": 0.85
    },
    {
      "sector": "finance",
      "impact": 0.4,
      "confidence": 0.85
    }
  ],
  "horizon": "medium",
  "freshness": {
    "dataTimestamp": "2024-01-15T10:00:00Z",
    "ageSeconds": 300
  },
  "sensitivity_breakdown": {
    "interest_rate": 0.8,
    "inflation": 0.15,
    "gdp": 0.05
  }
}
```

### POST /v1/macro/scenario-score

Calculates scenario score with custom assumptions.

**Price**: $0.03 per call

**Request**:
```json
{
  "eventId": "evt_123",
  "scenarioAssumptions": {
    "inflation": 3.5,
    "growth": 2.1
  },
  "sectors": ["tech", "finance"]
}
```

**Response**:
```json
{
  "eventId": "evt_123",
  "scenario_score": 0.65,
  "confidence_band": {
    "lower": 0.55,
    "upper": 0.75
  },
  "sectors": [
    {
      "sector": "tech",
      "score": 0.7
    },
    {
      "sector": "finance",
      "score": 0.6
    }
  ],
  "freshness": {
    "dataTimestamp": "2024-01-15T10:00:00Z",
    "ageSeconds": 300
  }
}
```

## Configuration

### Environment Variables

```bash
# Required for x402 payment processing
FACILITATOR_URL=https://facilitator.example.com
PAYMENTS_RECEIVABLE_ADDRESS=0x...
NETWORK=base-sepolia

# Optional
PORT=3002
```

### Running the Service

```bash
# Install dependencies
bun install

# Run the service
bun run packages/examples/src/macro-event-impact/index.ts

# Or with custom port
PORT=3002 bun run packages/examples/src/macro-event-impact/index.ts
```

## Testing

The implementation follows strict TDD methodology:

1. **Contract Tests**: Validate all request/response schemas
2. **Business Logic Tests**: Test core data transforms and calculations
3. **Integration Tests**: End-to-end endpoint testing with payment middleware

```bash
# Run all tests
bun test packages/examples/src/macro-event-impact/__tests__/

# Run specific test suite
bun test packages/examples/src/macro-event-impact/__tests__/contract.test.ts
bun test packages/examples/src/macro-event-impact/__tests__/business-logic.test.ts
bun test packages/examples/src/macro-event-impact/__tests__/integration.test.ts
```

## Architecture

Built using Lucid Agents framework packages:

- `@lucid-agents/core` - Agent runtime
- `@lucid-agents/http` - HTTP transport + SSE
- `@lucid-agents/payments` - x402 paywall + pricing
- `@lucid-agents/hono` - Web framework integration

## Data Model

### Event Types
- `interest_rate` - Central bank rate decisions
- `gdp` - GDP growth reports
- `inflation` - CPI/inflation data

### Sectors
- `tech` - Technology sector
- `finance` - Financial services
- `real_estate` - Real estate
- `consumer` - Consumer goods

### Horizons
- `short` - 0-3 months (0.5x multiplier)
- `medium` - 3-12 months (1.0x multiplier)
- `long` - 12+ months (1.5x multiplier)

## Error Codes

- `INVALID_EVENT_ID` - Event not found
- `INVALID_INPUT` - Schema validation failed
- `PAYMENT_REQUIRED` - x402 payment missing or invalid
- `INTERNAL_ERROR` - Unexpected server error

## Performance

- P95 response time: <= 500ms (cached path)
- All responses include freshness metadata
- Confidence scores on all predictions

## Agent Consumer Example

```typescript
import { createAgent } from '@lucid-agents/core';
import { a2a } from '@lucid-agents/a2a';

const agent = await createAgent({
  name: 'portfolio-manager',
  version: '1.0.0',
})
  .use(a2a())
  .build();

// Call macro event API
const events = await agent.a2a.invoke({
  agentUrl: 'http://localhost:3002',
  entrypoint: 'macro-events',
  input: {
    eventTypes: ['interest_rate'],
    geography: 'US',
  },
});

// Get impact vector
const impact = await agent.a2a.invoke({
  agentUrl: 'http://localhost:3002',
  entrypoint: 'macro-impact-vector',
  input: {
    eventId: events.event_feed[0].eventId,
    sectorSet: ['tech', 'finance'],
    horizon: 'medium',
  },
});

console.log('Impact on tech:', impact.sectors[0].impact);
```

## License

MIT

## Related

- Issue: [#186 - Macro Event Impact Vector API for Agents](https://github.com/daydreamsai/lucid-agents/issues/186)
- TaskMarket: [0xb435dbe6006d608fbdde93cb3c25e13ca40eac29f0d3d54f6de21314ebab24c0](https://api-market.daydreams.systems/api/tasks/0xb435dbe6006d608fbdde93cb3c25e13ca40eac29f0d3d54f6de21314ebab24c0)
