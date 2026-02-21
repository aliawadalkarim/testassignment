import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
} from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Controller('transfers')
export class TransfersController {
    constructor(private readonly transfersService: TransfersService) { }

    @Post()
    create(@Body() createTransferDto: CreateTransferDto) {
        return this.transfersService.create(createTransferDto);
    }

    @Get()
    findAll(@Query('senderId') senderId?: string) {
        return this.transfersService.findAll(senderId);
    }

    @Get('metrics')
    getMetrics() {
        return this.transfersService.getMetrics();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.transfersService.findById(id);
    }

    @Post(':id/confirm')
    confirm(@Param('id') id: string) {
        return this.transfersService.confirm(id);
    }

    @Post(':id/cancel')
    cancel(@Param('id') id: string) {
        return this.transfersService.cancel(id);
    }
}
