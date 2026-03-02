import { Controller, Post, Body } from '@nestjs/common';
import { QuoteService } from './quote.service';
import { CreateQuoteDto } from './dto/create-quote.dto';

@Controller()
export class QuoteController {
    constructor(private readonly quoteService: QuoteService) { }

    @Post('quote')
    async createQuote(@Body() createQuoteDto: CreateQuoteDto) {
        return this.quoteService.generateQuote(createQuoteDto);
    }
}
