import { IsOptional, IsString } from 'class-validator';

export class TransferQueryDto {
    @IsString()
    @IsOptional()
    senderId?: string;
}
