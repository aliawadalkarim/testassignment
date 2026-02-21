import { IsOptional, IsString } from 'class-validator';

export class ComplianceReviewDto {
    @IsString()
    @IsOptional()
    reviewerId?: string;

    @IsString()
    @IsOptional()
    reason?: string;
}
