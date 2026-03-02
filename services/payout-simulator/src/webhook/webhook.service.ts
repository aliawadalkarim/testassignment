import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
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

    private readonly webhookUrl: string;
    private readonly webhookSecret: string;
    private readonly maxRetries: number;
    private readonly delayMinMs: number;
    private readonly delayMaxMs: number;
    private readonly successRate: number;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.webhookUrl = this.configService.getOrThrow<string>('orchestratorWebhookUrl');
        this.webhookSecret = this.configService.getOrThrow<string>('webhookSecret');
        this.maxRetries = this.configService.getOrThrow<number>('webhook.maxRetries');
        this.delayMinMs = this.configService.getOrThrow<number>('webhook.delayMinMs');
        this.delayMaxMs = this.configService.getOrThrow<number>('webhook.delayMaxMs');
        this.successRate = this.configService.getOrThrow<number>('webhook.successRate');
    }

    async scheduleWebhook(
        partnerPayoutId: string,
        transferId: string,
        amount: number,
        currency: string,
    ): Promise<void> {
        const delayMs = this.delayMinMs + Math.random() * (this.delayMaxMs - this.delayMinMs);

        const status: 'PAID' | 'FAILED' = Math.random() < this.successRate ? 'PAID' : 'FAILED';

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

                await this.httpService.axiosRef.post(this.webhookUrl, payload, {
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
