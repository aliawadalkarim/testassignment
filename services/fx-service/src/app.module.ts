import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './common/config/configuration';
import { QuoteModule } from './quote/quote.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        QuoteModule,
    ],
})
export class AppModule { }
