import {
    IsNumber,
    IsString,
    IsObject,
    ValidateNested,
    Min,
    IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SenderDto {
    @IsString()
    @IsNotEmpty()
    senderId!: string;

    @IsString()
    @IsNotEmpty()
    name!: string;
}

export class RecipientDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsString()
    @IsNotEmpty()
    country!: string;

    @IsString()
    @IsNotEmpty()
    payoutMethod!: string;

    @IsObject()
    payoutDetails!: Record<string, string>;
}

export class CreateTransferDto {
    @ValidateNested()
    @Type(() => SenderDto)
    sender!: SenderDto;

    @ValidateNested()
    @Type(() => RecipientDto)
    recipient!: RecipientDto;

    @IsNumber()
    @Min(0.01)
    sendAmount!: number;

    @IsString()
    @IsNotEmpty()
    sendCurrency!: string;

    @IsString()
    @IsNotEmpty()
    payoutCurrency!: string;
}
