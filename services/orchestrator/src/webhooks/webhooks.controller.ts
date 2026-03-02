import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { HmacGuard } from './guards/hmac.guard';
import { PayoutWorkflowService } from '../transfers/services/payout-workflow.service';

interface PayoutWebhookPayload {
    partnerPayoutId: string;
    transferId: string;
    status: 'PAID' | 'FAILED';
    amount: number;
    currency: string;
    timestamp: string;
}

@Controller('webhooks')
export class WebhooksController {
    private readonly logger = new Logger(WebhooksController.name);

    constructor(private readonly payoutWorkflow: PayoutWorkflowService) { }

    @Post('payout-status')
    @UseGuards(HmacGuard)
    async handlePayoutStatus(@Body() payload: PayoutWebhookPayload) {
        this.logger.log(
            `Webhook received: partnerPayoutId=${payload.partnerPayoutId} status=${payload.status}`,
        );
        const transfer = await this.payoutWorkflow.handlePayoutWebhook(
            payload.partnerPayoutId,
            payload.status,
            payload.amount,
        );

        return {
            received: true,
            transferId: transfer.transferId,
            status: transfer.status,
        };
    }
}
