import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { HttpService } from '@nestjs/axios';
import * as crypto from 'crypto';

import { AppModule } from '../../src/app.module';

/**
 * Full lifecycle integration tests with mocked external services (FX, Payout).
 *
 * Uses MongoMemoryServer + overrideProvider(HttpService) so no real
 * external services are needed.
 */
describe('Full Lifecycle (e2e)', () => {
    let app: INestApplication;
    let mongoServer: MongoMemoryServer;
    const webhookSecret = 'test-webhook-secret';

    // Mock responses
    const fxQuoteResponse = {
        quoteId: 'q-test-123',
        rate: 0.92,
        fee: 7.5,
        payoutAmount: 452.3,
        sendAmount: 500,
        sendCurrency: 'USD',
        payoutCurrency: 'EUR',
        expiresAt: new Date(Date.now() + 120_000).toISOString(), // 2 minutes from now
    };

    let payoutIdCounter = 0;
    let lastPayoutId = '';

    let mockHttpService: {
        axiosRef: {
            post: jest.Mock;
        };
    };

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();

        process.env.MONGO_URI = mongoUri;
        process.env.WEBHOOK_SECRET = webhookSecret;
        process.env.FX_SERVICE_URL = 'http://localhost:19001';
        process.env.PAYOUT_SERVICE_URL = 'http://localhost:19002';

        mockHttpService = {
            axiosRef: {
                post: jest.fn().mockImplementation((url: string) => {
                    if (url.includes('/quote')) {
                        return Promise.resolve({ data: { ...fxQuoteResponse, expiresAt: new Date(Date.now() + 120_000).toISOString() } });
                    }
                    if (url.includes('/partner/payouts')) {
                        payoutIdCounter++;
                        lastPayoutId = `PP-test-${payoutIdCounter}`;
                        return Promise.resolve({ data: { partnerPayoutId: lastPayoutId, status: 'PENDING' } });
                    }
                    return Promise.reject(new Error(`Unexpected URL: ${url}`));
                }),
            },
        };

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(HttpService)
            .useValue(mockHttpService)
            .compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        );
        await app.init();
    });

    afterAll(async () => {
        await app.close();
        await mongoServer.stop();
    });

    function signPayload(payload: object): string {
        const body = JSON.stringify(payload);
        return crypto
            .createHmac('sha256', webhookSecret)
            .update(body)
            .digest('hex');
    }

    const validTransfer = {
        sender: { senderId: 'sender-001', name: 'Alice Johnson' },
        recipient: {
            name: 'Bob Williams',
            country: 'US',
            payoutMethod: 'BANK_TRANSFER',
            payoutDetails: { accountNumber: '123456789', routingNumber: '987654321' },
        },
        sendAmount: 500,
        sendCurrency: 'USD',
        payoutCurrency: 'EUR',
    };

    // ───────────────────────────────────────────────
    // Happy Path: create → quote → confirm → payout → PAID
    // ───────────────────────────────────────────────
    describe('happy path — full lifecycle to PAID', () => {
        let transferId: string;

        it('should create a transfer and auto-quote it', async () => {
            const res = await request(app.getHttpServer())
                .post('/transfers')
                .send(validTransfer)
                .expect(201);

            expect(res.body.transferId).toBeDefined();
            expect(res.body.status).toBe('QUOTED');
            expect(res.body.quote).toBeDefined();
            expect(res.body.quote.quoteId).toBe('q-test-123');
            transferId = res.body.transferId;
        });

        it('should confirm the transfer and auto-approve compliance', async () => {
            const res = await request(app.getHttpServer())
                .post(`/transfers/${transferId}/confirm`)
                .expect(201);

            // Amount 500 < 10000, country US not blocked, name not sanctioned
            // → compliance auto-approved → payout initiated → PAYOUT_PENDING
            expect(res.body.status).toBe('PAYOUT_PENDING');
            expect(res.body.confirmedQuoteSnapshot).toBeDefined();
            expect(res.body.complianceDecision.decision).toBe('APPROVED');
        });

        it('should process PAID webhook and transition to PAID', async () => {
            const webhookPayload = {
                partnerPayoutId: lastPayoutId,
                transferId,
                status: 'PAID',
                amount: 452.3,
                currency: 'EUR',
                timestamp: new Date().toISOString(),
            };

            const signature = signPayload(webhookPayload);

            const res = await request(app.getHttpServer())
                .post('/webhooks/payout-status')
                .set('X-Webhook-Signature', signature)
                .send(webhookPayload)
                .expect(201);

            expect(res.body.status).toBe('PAID');
        });

        it('should return the transfer in PAID state with financial summary', async () => {
            const res = await request(app.getHttpServer())
                .get(`/transfers/${transferId}`)
                .expect(200);

            expect(res.body.status).toBe('PAID');
            expect(res.body.financialSummary).toBeDefined();
            expect(res.body.financialSummary.paidAmount).toBe(452.3);
        });
    });

    // ───────────────────────────────────────────────
    // Failure Path: payout FAILED → auto-REFUNDED
    // ───────────────────────────────────────────────
    describe('failure path — payout FAILED → REFUNDED', () => {
        let transferId: string;

        it('should create and confirm a transfer', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/transfers')
                .send(validTransfer)
                .expect(201);

            transferId = createRes.body.transferId;

            const confirmRes = await request(app.getHttpServer())
                .post(`/transfers/${transferId}/confirm`)
                .expect(201);

            expect(confirmRes.body.status).toBe('PAYOUT_PENDING');
        });

        it('should process FAILED webhook and auto-refund', async () => {
            const webhookPayload = {
                partnerPayoutId: lastPayoutId,
                transferId,
                status: 'FAILED',
                amount: 452.3,
                currency: 'EUR',
                timestamp: new Date().toISOString(),
            };

            const signature = signPayload(webhookPayload);

            const res = await request(app.getHttpServer())
                .post('/webhooks/payout-status')
                .set('X-Webhook-Signature', signature)
                .send(webhookPayload)
                .expect(201);

            expect(res.body.status).toBe('REFUNDED');
        });

        it('should have refund details in financial summary', async () => {
            const res = await request(app.getHttpServer())
                .get(`/transfers/${transferId}`)
                .expect(200);

            expect(res.body.status).toBe('REFUNDED');
            expect(res.body.financialSummary.refundedAmount).toBe(500);
            expect(res.body.financialSummary.feesCharged).toBe(0);
        });
    });

    // ───────────────────────────────────────────────
    // Compliance Paths
    // ───────────────────────────────────────────────
    describe('compliance — blocked country auto-reject', () => {
        it('should auto-reject transfer to North Korea', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/transfers')
                .send({
                    ...validTransfer,
                    recipient: {
                        ...validTransfer.recipient,
                        country: 'KP',
                    },
                })
                .expect(201);

            const confirmRes = await request(app.getHttpServer())
                .post(`/transfers/${createRes.body.transferId}/confirm`)
                .expect(201);

            expect(confirmRes.body.status).toBe('COMPLIANCE_REJECTED');
            expect(confirmRes.body.complianceDecision.triggeredRules[0]).toContain('BLOCKED_COUNTRY');
        });
    });

    describe('compliance — sanctioned name auto-reject', () => {
        it('should auto-reject transfer to a sanctioned name', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/transfers')
                .send({
                    ...validTransfer,
                    recipient: {
                        ...validTransfer.recipient,
                        name: 'John Doe Sanctioned',
                    },
                })
                .expect(201);

            const confirmRes = await request(app.getHttpServer())
                .post(`/transfers/${createRes.body.transferId}/confirm`)
                .expect(201);

            expect(confirmRes.body.status).toBe('COMPLIANCE_REJECTED');
            expect(confirmRes.body.complianceDecision.triggeredRules[0]).toContain('SANCTIONED_NAME');
        });
    });

    describe('compliance — high amount manual review', () => {
        let transferId: string;

        it('should put high-amount transfer in COMPLIANCE_PENDING', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/transfers')
                .send({
                    ...validTransfer,
                    sendAmount: 15000,
                })
                .expect(201);

            transferId = createRes.body.transferId;

            const confirmRes = await request(app.getHttpServer())
                .post(`/transfers/${transferId}/confirm`)
                .expect(201);

            expect(confirmRes.body.status).toBe('COMPLIANCE_PENDING');
            expect(confirmRes.body.complianceDecision.decision).toBe('PENDING');
        });

        it('should allow manual approval and initiate payout', async () => {
            const res = await request(app.getHttpServer())
                .post(`/transfers/${transferId}/compliance/approve`)
                .send({ reviewerId: 'reviewer-001', reason: 'Verified manually' })
                .expect(201);

            expect(res.body.status).toBe('PAYOUT_PENDING');
            expect(res.body.complianceDecision.decision).toBe('APPROVED');
            expect(res.body.complianceDecision.reviewerId).toBe('reviewer-001');
        });
    });

    describe('compliance — manual rejection', () => {
        let transferId: string;

        it('should put high-amount transfer in COMPLIANCE_PENDING and reject it', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/transfers')
                .send({
                    ...validTransfer,
                    sendAmount: 12000,
                })
                .expect(201);

            transferId = createRes.body.transferId;

            await request(app.getHttpServer())
                .post(`/transfers/${transferId}/confirm`)
                .expect(201);

            const rejectRes = await request(app.getHttpServer())
                .post(`/transfers/${transferId}/compliance/reject`)
                .send({ reviewerId: 'reviewer-002', reason: 'Suspicious activity' })
                .expect(201);

            expect(rejectRes.body.status).toBe('COMPLIANCE_REJECTED');
            expect(rejectRes.body.complianceDecision.decision).toBe('REJECTED');
        });
    });

    // ───────────────────────────────────────────────
    // Webhook Idempotency
    // ───────────────────────────────────────────────
    describe('webhook idempotency — duplicate ignored', () => {
        let transferId: string;

        it('should create, confirm, and pay a transfer', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/transfers')
                .send(validTransfer)
                .expect(201);

            transferId = createRes.body.transferId;

            await request(app.getHttpServer())
                .post(`/transfers/${transferId}/confirm`)
                .expect(201);

            const webhookPayload = {
                partnerPayoutId: lastPayoutId,
                transferId,
                status: 'PAID',
                amount: 452.3,
                currency: 'EUR',
                timestamp: new Date().toISOString(),
            };

            const signature = signPayload(webhookPayload);

            await request(app.getHttpServer())
                .post('/webhooks/payout-status')
                .set('X-Webhook-Signature', signature)
                .send(webhookPayload)
                .expect(201);
        });

        it('should silently ignore a duplicate PAID webhook', async () => {
            const duplicatePayload = {
                partnerPayoutId: lastPayoutId,
                transferId,
                status: 'PAID',
                amount: 452.3,
                currency: 'EUR',
                timestamp: new Date().toISOString(),
            };

            const signature = signPayload(duplicatePayload);

            const res = await request(app.getHttpServer())
                .post('/webhooks/payout-status')
                .set('X-Webhook-Signature', signature)
                .send(duplicatePayload)
                .expect(201);

            // Should still be PAID (not error)
            expect(res.body.status).toBe('PAID');
        });
    });

    // ───────────────────────────────────────────────
    // Cancel from valid states
    // ───────────────────────────────────────────────
    describe('cancel — from QUOTED state', () => {
        it('should cancel a QUOTED transfer', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/transfers')
                .send(validTransfer)
                .expect(201);

            const cancelRes = await request(app.getHttpServer())
                .post(`/transfers/${createRes.body.transferId}/cancel`)
                .expect(201);

            expect(cancelRes.body.status).toBe('CANCELLED');
        });
    });

    // ───────────────────────────────────────────────
    // Invalid state transitions
    // ───────────────────────────────────────────────
    describe('invalid transitions', () => {
        it('should reject cancelling a confirmed transfer', async () => {
            const createRes = await request(app.getHttpServer())
                .post('/transfers')
                .send(validTransfer)
                .expect(201);

            await request(app.getHttpServer())
                .post(`/transfers/${createRes.body.transferId}/confirm`)
                .expect(201);

            // Cancelling after confirm should fail
            await request(app.getHttpServer())
                .post(`/transfers/${createRes.body.transferId}/cancel`)
                .expect(400);
        });
    });

    // ───────────────────────────────────────────────
    // Metrics
    // ───────────────────────────────────────────────
    describe('metrics', () => {
        it('should return transfer counts by status', async () => {
            const res = await request(app.getHttpServer())
                .get('/transfers/metrics')
                .expect(200);

            expect(res.body.total).toBeGreaterThan(0);
            expect(typeof res.body.total).toBe('number');
        });
    });
});
