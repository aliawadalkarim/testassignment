import { Injectable, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateQuoteDto } from './dto/create-quote.dto';

export interface QuoteResponse {
    quoteId: string;
    sendAmount: number;
    sendCurrency: string;
    payoutCurrency: string;
    rate: number;
    fee: number;
    payoutAmount: number;
    expiresAt: string;
}

// Simulated base rates (against USD)
const BASE_RATES: Record<string, Record<string, number>> = {
    USD: { EUR: 0.92, GBP: 0.79, INR: 83.1, PHP: 56.2, NGN: 775.0, AED: 3.67, PKR: 278.5, BDT: 110.0 },
    EUR: { USD: 1.09, GBP: 0.86, INR: 90.5 },
    GBP: { USD: 1.27, EUR: 1.16, INR: 105.2 },
};

@Injectable()
export class QuoteService {
    generateQuote(dto: CreateQuoteDto): QuoteResponse {
        const { sendAmount, sendCurrency, payoutCurrency } = dto;

        const baseRate = this.getBaseRate(sendCurrency, payoutCurrency);
        if (baseRate === null) {
            throw new BadRequestException(
                `Unsupported currency pair: ${sendCurrency} → ${payoutCurrency}`,
            );
        }

        // Apply ±2% jitter to simulate rate variation
        const jitter = 1 + (Math.random() * 0.04 - 0.02);
        const rate = parseFloat((baseRate * jitter).toFixed(6));

        // Fee = flat $5 + 0.5% of sendAmount
        const fee = parseFloat((5 + sendAmount * 0.005).toFixed(2));

        if (fee >= sendAmount) {
            throw new BadRequestException('Send amount is too small to cover fees');
        }

        const payoutAmount = parseFloat(((sendAmount - fee) * rate).toFixed(2));

        // Quote expires in 60 seconds
        const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();

        return {
            quoteId: uuidv4(),
            sendAmount,
            sendCurrency,
            payoutCurrency,
            rate,
            fee,
            payoutAmount,
            expiresAt,
        };
    }

    private getBaseRate(from: string, to: string): number | null {
        if (from === to) return 1;
        const fromRates = BASE_RATES[from];
        if (fromRates && fromRates[to] !== undefined) {
            return fromRates[to];
        }
        // Try reverse
        const toRates = BASE_RATES[to];
        if (toRates && toRates[from] !== undefined) {
            return parseFloat((1 / toRates[from]).toFixed(6));
        }
        return null;
    }
}
