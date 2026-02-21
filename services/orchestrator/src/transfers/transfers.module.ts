import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';
import { Transfer, TransferSchema } from './schemas/transfer.schema';
import { StateMachineModule } from '../state-machine/state-machine.module';
import { ComplianceModule } from '../compliance/compliance.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Transfer.name, schema: TransferSchema },
        ]),
        HttpModule,
        StateMachineModule,
        forwardRef(() => ComplianceModule),
    ],
    controllers: [TransfersController],
    providers: [TransfersService],
    exports: [TransfersService],
})
export class TransfersModule { }
