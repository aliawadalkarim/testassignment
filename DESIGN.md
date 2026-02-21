# Design Document

## Architecture Overview

The platform consists of three independent NestJS microservices communicating over HTTP:

1. **Orchestrator** (port 3000) — the central service that manages transfer lifecycle, enforces state transitions, runs compliance screening, and coordinates with external services.
2. **FX Quote Service** (port 3001) — provides foreign exchange quotes with simulated rate variation.
3. **Payout Partner Simulator** (port 3002) — simulates a third-party payout provider with async webhook callbacks.

**Data Store**: MongoDB stores all transfer state, quote snapshots, compliance decisions, and financial summaries.

**Communication Pattern**:
- Orchestrator → FX Service: synchronous HTTP request for quotes
- Orchestrator → Payout Service: synchronous HTTP request to initiate payout
- Payout Service → Orchestrator: asynchronous webhook callback with payout result

## State Machine

```
CREATED ──▶ QUOTED ──▶ CONFIRMED ──┬──▶ COMPLIANCE_APPROVED ──▶ PAYOUT_PENDING ──┬──▶ PAID
  │            │                   │                                              │
  │            │                   ├──▶ COMPLIANCE_PENDING ──┬──▶ APPROVED ───────┘
  │            │                   │                         │
  ▼            ▼                   ▼                         ▼
CANCELLED   CANCELLED     COMPLIANCE_REJECTED        COMPLIANCE_REJECTED

                                                    PAYOUT_PENDING ──▶ FAILED ──▶ REFUNDED
```

**Rules**:
- Transitions are strictly enforced; invalid transitions return `400 Bad Request` with a descriptive error.
- Terminal states: `PAID`, `REFUNDED`, `CANCELLED`, `COMPLIANCE_REJECTED`.
- Optimistic concurrency control (`version` field) prevents double-transitions from concurrent requests.

## Compliance Module

Runs automatically after `POST /transfers/:id/confirm`. Three rules evaluated in order:

1. **Country blocklist** (`KP`, `IR`, `SY`, `CU`) → Auto-Reject
2. **Name screening** (hardcoded sanctions list) → Auto-Reject. *Design choice*: Name matches are auto-rejected rather than sent to manual review, because sanctioned name matches represent clear compliance violations that should not proceed under any circumstances.
3. **Amount > $10,000** → Manual Review (`COMPLIANCE_PENDING`)

Manual review endpoints (`/compliance/approve`, `/compliance/reject`) are only valid when status is `COMPLIANCE_PENDING`.

Each decision is persisted with: decision, triggered rules, timestamp, and reviewerId (for manual reviews).

## Timeout & Retry Handling

### FX Quote Requests
- 5-second HTTP timeout. If the FX service is unavailable, the transfer creation fails with a clear error.
- The transfer remains in `CREATED` state — client can retry the entire request.

### Payout Initiation
- 5-second HTTP timeout. If the payout service is unavailable, the transition to `PAYOUT_PENDING` does not occur.
- The transfer stays in `COMPLIANCE_APPROVED` — the confirm flow can be retried.

### Webhook Delivery (Payout → Orchestrator)
- Payout simulator retries webhook delivery with **exponential backoff** (1s → 2s → 4s, max 3 retries).
- HMAC-SHA256 signature verification prevents spoofed webhooks.
- **Idempotent handling**: If the transfer is already in a terminal state (`PAID`, `REFUNDED`), duplicate webhooks are silently ignored.

### Optimistic Concurrency
- Every state change increments a `version` field on the transfer document.
- Updates use `findOneAndUpdate` with the expected previous version — if a concurrent modification happened, a `409 Conflict` is returned.
- This prevents scenarios like two webhooks racing to update the same transfer.

## What I Would Improve for Production

1. **Message Queue**: Replace synchronous HTTP calls with a message broker (RabbitMQ/Kafka) for payout initiation. This decouples services and improves resilience.

2. **Saga Pattern / Outbox**: Use the transactional outbox pattern to guarantee that state changes and downstream actions (payout initiation) happen atomically.

3. **Distributed Tracing**: Add OpenTelemetry for request tracing across services (correlation IDs are logged but not propagated via headers yet).

4. **Proper FX Rate Provider**: Use real market data feeds with caching, staleness detection, and fallback rates.

5. **Database**: Use MongoDB replica set with read concerns for stronger consistency guarantees. Add TTL indexes on completed transfers for archival.

6. **Secrets Management**: Use a vault (AWS Secrets Manager, HashiCorp Vault) instead of environment variables for webhook secrets and API keys.

7. **Rate Limiting & Auth**: Add API authentication (JWT/API key), rate limiting, and IP whitelisting for webhook endpoints.

8. **Monitoring**: Prometheus metrics, Grafana dashboards, PagerDuty alerts for failed payouts, stuck transfers, and compliance review SLAs.

9. **Idempotency Keys**: Accept client-provided idempotency keys on `POST /transfers` to prevent duplicate transfer creation on network retries.

10. **Audit Log**: Separate audit log table with immutable, append-only entries for every state change — required for financial compliance.
