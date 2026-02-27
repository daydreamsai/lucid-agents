# Supplier Reliability Signal Marketplace API

A paid supplier-intelligence API providing lead-time drift, fill-rate risk, and disruption probability signals for procurement agents.

## Overview

This API enables sourcing agents to access normalized reliability signals and confidence bands to choose resilient suppliers under constraints. All endpoints require payment via the x402 protocol.

## API Endpoints

### GET /v1/suppliers/score

Get normalized supplier reliability score.

**Request Parameters:**
- `supplierId` (required): Supplier identifier (e.g., "SUP-12345")
- `category` (optional): Product category (e.g., "electronics")
- `region` (required): Geographic region - one of: APAC, EMEA, AMER, LATAM

**Response:**
```json
{
  "supplier_score": 0.85,
  "confidence": 0.92,
  "freshness_ms": 3600000,
  "metadata": {
    "data_points": 150,
    "last_updated": "2024-02-27T00:00:00Z"
  }
}
```

**Example:**
```bash
curl -H "X-Payment: <base64-payment-header>" \
  "https://api.example.com/v1/suppliers/score?supplierId=SUP-12345&region=APAC&category=electronics"
```

### GET /v1/suppliers/lead-time-forecast

Get lead time forecast with drift probability.

**Request Parameters:**
- `supplierId` (required): Supplier identifier
- `category` (optional): Product category
- `region` (required): Geographic region - one of: APAC, EMEA, AMER, LATAM
- `horizonDays` (optional, default: 30): Forecast horizon in days (1-365)

**Response:**
```json
{
  "lead_time_p50": 15,
  "lead_time_p95": 28,
  "drift_probability": 0.12,
  "confidence": 0.88,
  "freshness_ms": 7200000
}
```

**Example:**
```bash
curl -H "X-Payment: <base64-payment-header>" \
  "https://api.example.com/v1/suppliers/lead-time-forecast?supplierId=SUP-12345&region=APAC&horizonDays=30"
```

### GET /v1/suppliers/disruption-alerts

Get disruption probability and alert reasons.

**Request Parameters:**
- `supplierId` (required): Supplier identifier
- `region` (required): Geographic region - one of: APAC, EMEA, AMER, LATAM
- `riskTolerance` (optional, default: "medium"): Risk tolerance level - one of: low, medium, high

**Response:**
```json
{
  "disruption_probability": 0.23,
  "alert_reasons": ["port_congestion", "weather_event"],
  "severity": "medium",
  "confidence": 0.79,
  "freshness_ms": 1800000
}
```

**Example:**
```bash
curl -H "X-Payment: <base64-payment-header>" \
  "https://api.example.com/v1/suppliers/disruption-alerts?supplierId=SUP-12345&region=APAC&riskTolerance=medium"
```

## Payment

All endpoints require payment via the x402 protocol. When payment is not provided or invalid, the API returns a 402 Payment Required response with payment details:

```json
{
  "x402Version": 2,
  "error": "Payment required"
}
```

Headers:
- `PAYMENT-REQUIRED: true`

## Error Responses

All errors follow a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

**Error Codes:**
- `VALIDATION_ERROR`: Invalid input parameters
- `INVALID_PAYMENT`: Payment header is invalid or malformed
- `INVALID_SUPPLIER_ID`: Supplier ID not found
- `INTERNAL_ERROR`: Internal server error

## Data Freshness

All responses include a `freshness_ms` field indicating the age of the data in milliseconds. Typical freshness ranges:
- Supplier scores: 1-4 hours
- Lead time forecasts: 2-6 hours
- Disruption alerts: 30 minutes - 2 hours

## Confidence Bands

All responses include a `confidence` field (0-1) indicating the reliability of the signal based on:
- Number of data points
- Data recency
- Historical accuracy

Higher confidence values indicate more reliable signals.

## Architecture

Built with:
- **Runtime**: @lucid-agents/core
- **Transport**: @lucid-agents/hono
- **Payments**: @lucid-agents/payments (x402 protocol)
- **Validation**: Zod schemas

## Development

### Install Dependencies
```bash
bun install
```

### Run Tests
```bash
bun test
```

### Start Development Server
```bash
bun run dev
```

## Test Coverage

The implementation follows TDD principles with comprehensive test coverage:

1. **Contract Tests** (`__tests__/contracts.test.ts`): Validate all request/response schemas
2. **Business Logic Tests** (`__tests__/business-logic.test.ts`): Test core data transforms and calculations
3. **Integration Tests** (`__tests__/integration.test.ts`): Test paid endpoint behavior and x402 integration

## License

MIT
