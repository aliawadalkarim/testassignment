import { Injectable, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
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

/** Fallback rates used when the live API is unreachable */
const FALLBACK_RATES: Record<string, Record<string, number>> = {
    USD: { EUR: 0.92, GBP: 0.79, INR: 83.1, PHP: 56.2, NGN: 775.0, AED: 3.67, PKR: 278.5, BDT: 110.0 },
    EUR: { USD: 1.09, GBP: 0.86, INR: 90.5 },
    GBP: { USD: 1.27, EUR: 1.16, INR: 105.2 },
};

interface CachedRates {
    rates: Record<string, number>;
    fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const API_BASE_URL = 'https://open.er-api.com/v6/latest';

@Injectable()
export class QuoteService implements OnModuleInit {
    private readonly logger = new Logger(QuoteService.name);
    private rateCache = new Map<string, CachedRates>();

    constructor(private readonly httpService: HttpService) { }

    async onModuleInit(): Promise<void> {
        // Pre-warm cache with USD rates on startup
        try {
            await this.fetchRates('USD');
            this.logger.log('Successfully pre-warmed FX rate cache for USD');
        } catch (error) {
            this.logger.warn('Failed to pre-warm FX rate cache; will use fallback rates until API is available');
        }
    }

    async generateQuote(dto: CreateQuoteDto): Promise<QuoteResponse> {
        const { sendAmount, sendCurrency, payoutCurrency } = dto;

        const baseRate = await this.getBaseRate(sendCurrency, payoutCurrency);
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

    private async fetchRates(baseCurrency: string): Promise<Record<string, number>> {
        const cached = this.rateCache.get(baseCurrency);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
            return cached.rates;
        }

        this.logger.log(`Fetching live FX rates for ${baseCurrency} from ExchangeRate-API`);
        const { data } = await firstValueFrom(
            this.httpService.get(`${API_BASE_URL}/${baseCurrency}`, { timeout: 5000 }),
        );

        if (data.result !== 'success') {
            throw new Error(`ExchangeRate-API returned non-success result: ${data.result}`);
        }

        this.rateCache.set(baseCurrency, {
            rates: data.rates,
            fetchedAt: Date.now(),
        });

        return data.rates;
    }

    private async getBaseRate(from: string, to: string): Promise<number | null> {
        if (from === to) return 1;

        // Try live API first
        try {
            const rates = await this.fetchRates(from);
            if (rates[to] !== undefined) {
                return rates[to];
            }
        } catch (error) {
            this.logger.warn(`Failed to fetch live rates for ${from}, falling back to hardcoded rates: ${error.message}`);
        }

        // Fallback to hardcoded rates
        const fromRates = FALLBACK_RATES[from];
        if (fromRates && fromRates[to] !== undefined) {
            return fromRates[to];
        }

        // Try reverse lookup from fallback
        const toRates = FALLBACK_RATES[to];
        if (toRates && toRates[from] !== undefined) {
            return parseFloat((1 / toRates[from]).toFixed(6));
        }

        return null;
    }
}
