import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { TransfersModule } from '../transfers/transfers.module';
import { HmacGuard } from './guards/hmac.guard';

@Module({
    imports: [TransfersModule],
    controllers: [WebhooksController],
    providers: [HmacGuard],
})
export class WebhooksModule { }
