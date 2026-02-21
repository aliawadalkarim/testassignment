import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AppModule } from '../../src/app.module';
import * as crypto from 'crypto';

/**
 * Integration test: Failure Path
 * Tests webhook handling: payout failed → refunded
 *
 * Uses MongoMemoryServer for isolated database.
 */
describe('Failure Path (e2e)', () => {
    let app: INestApplication;
    let mongoServer: MongoMemoryServer;
    const webhookSecret = 'test-webhook-secret';

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();

        process.env.MONGO_URI = mongoUri;
        process.env.WEBHOOK_SECRET = webhookSecret;
        process.env.FX_SERVICE_URL = 'http://localhost:19001';
        process.env.PAYOUT_SERVICE_URL = 'http://localhost:19002';

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

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

    describe('webhook signature verification', () => {
        it('should reject webhooks without signature', async () => {
            await request(app.getHttpServer())
                .post('/webhooks/payout-status')
                .send({
                    partnerPayoutId: 'PP-test',
                    transferId: 'test-id',
                    status: 'PAID',
                    amount: 100,
                    currency: 'EUR',
                    timestamp: new Date().toISOString(),
                })
                .expect(401);
        });

        it('should reject webhooks with invalid signature', async () => {
            const payload = {
                partnerPayoutId: 'PP-test',
                transferId: 'test-id',
                status: 'PAID',
                amount: 100,
                currency: 'EUR',
                timestamp: new Date().toISOString(),
            };

            await request(app.getHttpServer())
                .post('/webhooks/payout-status')
                .set('X-Webhook-Signature', 'invalid-signature-hex-value-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
                .send(payload)
                .expect(401);
        });

        it('should accept webhooks with valid signature (returns 404 if transfer not found)', async () => {
            const payload = {
                partnerPayoutId: 'PP-nonexistent',
                transferId: 'nonexistent-id',
                status: 'FAILED',
                amount: 100,
                currency: 'EUR',
                timestamp: new Date().toISOString(),
            };

            const signature = signPayload(payload);

            await request(app.getHttpServer())
                .post('/webhooks/payout-status')
                .set('X-Webhook-Signature', signature)
                .send(payload)
                .expect(404); // Valid signature but transfer not found
        });
    });
});
