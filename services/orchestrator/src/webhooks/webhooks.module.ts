import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { TransfersModule } from '../transfers/transfers.module';

@Module({
    imports: [TransfersModule],
    controllers: [WebhooksController],
})
export class WebhooksModule { }
