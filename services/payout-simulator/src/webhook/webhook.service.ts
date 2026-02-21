import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';

interface WebhookPayload {
    partnerPayoutId: string;
    transferId: string;
    status: 'PAID' | 'FAILED';
    amount: number;
    currency: string;
    timestamp: string;
}

@Injectable()
export class WebhookService {
    private readonly logger = new Logger(WebhookService.name);
    private readonly maxRetries = 3;
    private readonly webhookUrl: string;
    private readonly webhookSecret: string;

    constructor() {
        this.webhookUrl =
            process.env.ORCHESTRATOR_WEBHOOK_URL ||
            'http://orchestrator:3000/webhooks/payout-status';
        this.webhookSecret =
            process.env.WEBHOOK_SECRET || 'super-secret-webhook-key-change-me';
    }

    async scheduleWebhook(
        partnerPayoutId: string,
        transferId: string,
        amount: number,
        currency: string,
    ): Promise<void> {
        // Random delay 2-5 seconds to simulate async processing
        const delayMs = 2000 + Math.random() * 3000;

        // ~80% success, ~20% failure
        const status: 'PAID' | 'FAILED' = Math.random() < 0.8 ? 'PAID' : 'FAILED';

        setTimeout(async () => {
            const payload: WebhookPayload = {
                partnerPayoutId,
                transferId,
                status,
                amount,
                currency,
                timestamp: new Date().toISOString(),
            };

            await this.deliverWithRetry(payload);
        }, delayMs);

        this.logger.log(
            `Scheduled webhook for payout ${partnerPayoutId} (delay: ${Math.round(delayMs)}ms)`,
        );
    }

    private async deliverWithRetry(payload: WebhookPayload): Promise<void> {
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const body = JSON.stringify(payload);
                const signature = this.signPayload(body);

                await axios.post(this.webhookUrl, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Webhook-Signature': signature,
                    },
                    timeout: 5000,
                });

                this.logger.log(
                    `Webhook delivered for payout ${payload.partnerPayoutId} (status: ${payload.status}, attempt: ${attempt + 1})`,
                );
                return;
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                this.logger.warn(
                    `Webhook delivery failed for ${payload.partnerPayoutId} (attempt ${attempt + 1}/${this.maxRetries + 1}): ${errMsg}`,
                );

                if (attempt < this.maxRetries) {
                    // Exponential backoff: 1s, 2s, 4s
                    const backoffMs = Math.pow(2, attempt) * 1000;
                    await this.sleep(backoffMs);
                }
            }
        }

        this.logger.error(
            `Webhook delivery exhausted all retries for payout ${payload.partnerPayoutId}`,
        );
    }

    private signPayload(body: string): string {
        return crypto
            .createHmac('sha256', this.webhookSecret)
            .update(body)
            .digest('hex');
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
