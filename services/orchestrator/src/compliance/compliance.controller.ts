import { Controller, Post, Param, Body } from '@nestjs/common';
import { TransfersService } from '../transfers/transfers.service';
import { ComplianceReviewDto } from './dto/compliance-review.dto';

@Controller('transfers')
export class ComplianceController {
    constructor(private readonly transfersService: TransfersService) { }

    @Post(':id/compliance/approve')
    approve(
        @Param('id') id: string,
        @Body() dto: ComplianceReviewDto,
    ) {
        return this.transfersService.complianceApprove(
            id,
            dto.reviewerId,
            dto.reason,
        );
    }

    @Post(':id/compliance/reject')
    reject(
        @Param('id') id: string,
        @Body() dto: ComplianceReviewDto,
    ) {
        return this.transfersService.complianceReject(
            id,
            dto.reviewerId,
            dto.reason,
        );
    }
}
