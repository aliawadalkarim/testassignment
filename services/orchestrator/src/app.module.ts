import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import configuration from './common/config/configuration';
import { TransfersModule } from './transfers/transfers.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        MongooseModule.forRoot(
            process.env.MONGO_URI || 'mongodb://localhost:27017/remittance',
        ),
        TransfersModule,
        WebhooksModule,
    ],
})
export class AppModule { }
