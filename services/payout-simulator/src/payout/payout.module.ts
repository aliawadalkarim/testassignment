import { Module } from '@nestjs/common';
import { PayoutController } from './payout.controller';
import { PayoutService } from './payout.service';
import { WebhookModule } from '../webhook/webhook.module';

@Module({
    imports: [WebhookModule],
    controllers: [PayoutController],
    providers: [PayoutService],
})
export class PayoutModule { }
