import { Module, forwardRef } from '@nestjs/common';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { TransfersModule } from '../transfers/transfers.module';

@Module({
    imports: [forwardRef(() => TransfersModule)],
    controllers: [ComplianceController],
    providers: [ComplianceService],
    exports: [ComplianceService],
})
export class ComplianceModule { }
