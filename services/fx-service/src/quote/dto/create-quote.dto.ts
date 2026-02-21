import { IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class CreateQuoteDto {
    @IsNumber()
    @Min(0.01)
    sendAmount!: number;

    @IsString()
    sendCurrency!: string;

    @IsString()
    payoutCurrency!: string;

    @IsString()
    @IsOptional()
    destinationCountry?: string;

    @IsString()
    @IsOptional()
    payoutMethod?: string;
}
