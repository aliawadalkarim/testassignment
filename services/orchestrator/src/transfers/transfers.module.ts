import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
        StateMachineModule,
        ComplianceModule,
    ],
    controllers: [TransfersController],
    providers: [TransfersService],
    exports: [TransfersService],
})
export class TransfersModule { }
