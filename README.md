# Remittance Platform

A simplified cross-border remittance platform built with **NestJS** (TypeScript), featuring FX quoting, compliance screening, simulated payout processing, and webhook-based status updates.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────────┐
│   Orchestrator   │────▶│  FX Service  │     │  Payout Simulator   │
│   (port 3000)    │     │  (port 3001) │     │   (port 3002)       │
│                  │────▶│              │     │                     │
│  - Transfers API │     │  Live rates  │     │  - POST /partner/   │
│  - Compliance    │     │  via API ────│───▶ ExchangeRate-API
│  - Webhooks      │◀──── webhook ────────────│  - HMAC signed      │
│  - State Machine │                          │  - Retry w/ backoff  │
└────────┬─────────┘                          └─────────────────────┘
         │
    ┌────▼────┐
    │ MongoDB │
    │ (27017) │
    └─────────┘
```

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- Node.js 20+ (for local development without Docker)

## Quick Start (Docker)

```bash
# Clone and start all services
docker-compose up --build

# Services will be available at:
# Orchestrator: http://localhost:3000
# FX Service:   http://localhost:3001
# Payout Sim:   http://localhost:3002
```

## Local Development

```bash
# Install dependencies for all services at once (from project root)
npm run install:all

# Or install individually
cd services/orchestrator && npm install
cd ../fx-service && npm install
cd ../payout-simulator && npm install

# Start MongoDB (requires Docker)
docker run -d --name mongo -p 27017:27017 mongo:7

# Start services (in separate terminals)
cd services/fx-service && npm run start:dev
cd services/payout-simulator && npm run start:dev
cd services/orchestrator && npm run start:dev
```

> **Root-level scripts**: `npm run install:all`, `npm run build:all`, and `npm run test:all` are available from the project root for convenience.

## Running Tests

```bash
# Unit tests
cd services/orchestrator
npm test

# Integration/E2E tests (uses MongoMemoryServer, no Docker needed)
npm run test:e2e

# All tests
npm run test:all
```

## API Examples

### 1. Create a Transfer

```bash
curl -X POST http://localhost:3000/transfers \
  -H "Content-Type: application/json" \
  -d '{
    "sender": { "senderId": "sender-001", "name": "Alice Johnson" },
    "recipient": {
      "name": "Bob Williams",
      "country": "GB",
      "payoutMethod": "BANK_TRANSFER",
      "payoutDetails": { "accountNumber": "12345678", "sortCode": "123456" }
    },
    "sendAmount": 500,
    "sendCurrency": "USD",
    "payoutCurrency": "GBP"
  }'
```

### 2. Get Transfer Details

```bash
curl http://localhost:3000/transfers/<transferId>
```

### 3. Confirm a Transfer

```bash
curl -X POST http://localhost:3000/transfers/<transferId>/confirm
```

### 4. Cancel a Transfer

```bash
curl -X POST http://localhost:3000/transfers/<transferId>/cancel
```

### 5. Manual Compliance Review

```bash
# Approve
curl -X POST http://localhost:3000/transfers/<transferId>/compliance/approve \
  -H "Content-Type: application/json" \
  -d '{ "reviewerId": "reviewer-001", "reason": "Verified manually" }'

# Reject
curl -X POST http://localhost:3000/transfers/<transferId>/compliance/reject \
  -H "Content-Type: application/json" \
  -d '{ "reviewerId": "reviewer-001", "reason": "Suspicious activity" }'
```

### 6. List Transfers by Sender

```bash
curl http://localhost:3000/transfers?senderId=sender-001
```

### 7. View Metrics

```bash
curl http://localhost:3000/transfers/metrics
```

### 8. Test Compliance Scenarios

```bash
# Blocked country (auto-reject)
curl -X POST http://localhost:3000/transfers \
  -H "Content-Type: application/json" \
  -d '{
    "sender": { "senderId": "sender-002", "name": "Test User" },
    "recipient": { "name": "Recipient", "country": "KP", "payoutMethod": "BANK_TRANSFER", "payoutDetails": {} },
    "sendAmount": 100, "sendCurrency": "USD", "payoutCurrency": "EUR"
  }'

# High amount (manual review required)
curl -X POST http://localhost:3000/transfers \
  -H "Content-Type: application/json" \
  -d '{
    "sender": { "senderId": "sender-003", "name": "Test User" },
    "recipient": { "name": "Normal Person", "country": "US", "payoutMethod": "BANK_TRANSFER", "payoutDetails": {} },
    "sendAmount": 15000, "sendCurrency": "USD", "payoutCurrency": "EUR"
  }'
```

## FX Rate Source

The FX Service fetches **live exchange rates** from the [ExchangeRate-API](https://www.exchangerate-api.com/) (open access, no API key required). Rates are cached in memory for 5 minutes to minimize external calls. If the API is unreachable, the service falls back to a set of hardcoded rates for common currency pairs (USD, EUR, GBP).

- **160+ currencies** supported via live rates
- **Cache TTL**: 5 minutes
- **Pre-warming**: USD rates are fetched on service startup

## Environment Variables

| Variable              | Default                                | Description                   |
| --------------------- | -------------------------------------- | ----------------------------- |
| `PORT`                | `3000`                                 | Orchestrator port             |
| `MONGO_URI`           | `mongodb://localhost:27017/remittance` | MongoDB connection string     |
| `FX_SERVICE_URL`      | `http://localhost:3001`                | FX Quote Service URL          |
| `PAYOUT_SERVICE_URL`  | `http://localhost:3002`                | Payout Simulator URL          |
| `WEBHOOK_SECRET`      | *(required)*                           | HMAC signing key for webhooks |
| `FX_SERVICE_PORT`     | `3001`                                 | FX service listen port        |
| `PAYOUT_SERVICE_PORT` | `3002`                                 | Payout simulator listen port  |
