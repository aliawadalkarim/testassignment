import { IsNumber, IsString, Min } from 'class-validator';

export class CreatePayoutDto {
    @IsString()
    transferId!: string;

    @IsNumber()
    @Min(0.01)
    amount!: number;

    @IsString()
    currency!: string;

    @IsString()
    recipientName!: string;

    @IsString()
    payoutMethod!: string;
}
