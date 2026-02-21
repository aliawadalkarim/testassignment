import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { WebhookService } from '../webhook/webhook.service';
import { CreatePayoutDto } from './dto/create-payout.dto';

export interface PayoutResponse {
    partnerPayoutId: string;
    status: 'PENDING';
}

@Injectable()
export class PayoutService {
    private readonly logger = new Logger(PayoutService.name);

    constructor(private readonly webhookService: WebhookService) { }

    async createPayout(dto: CreatePayoutDto): Promise<PayoutResponse> {
        const partnerPayoutId = `PP-${uuidv4()}`;

        this.logger.log(
            `Payout created: ${partnerPayoutId} for transfer ${dto.transferId} (${dto.amount} ${dto.currency})`,
        );

        // Schedule async webhook callback
        this.webhookService.scheduleWebhook(
            partnerPayoutId,
            dto.transferId,
            dto.amount,
            dto.currency,
        );

        return {
            partnerPayoutId,
            status: 'PENDING',
        };
    }
}
