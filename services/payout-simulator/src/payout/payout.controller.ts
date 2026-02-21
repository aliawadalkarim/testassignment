import { Controller, Post, Body } from '@nestjs/common';
import { PayoutService } from './payout.service';
import { CreatePayoutDto } from './dto/create-payout.dto';

@Controller('partner')
export class PayoutController {
    constructor(private readonly payoutService: PayoutService) { }

    @Post('payouts')
    createPayout(@Body() createPayoutDto: CreatePayoutDto) {
        return this.payoutService.createPayout(createPayoutDto);
    }
}
