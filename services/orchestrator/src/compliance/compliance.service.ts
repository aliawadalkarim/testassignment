import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransferStatus, IComplianceDecision } from '../common/interfaces';

export interface ComplianceResult {
    status: TransferStatus.COMPLIANCE_APPROVED | TransferStatus.COMPLIANCE_PENDING | TransferStatus.COMPLIANCE_REJECTED;
    decision: IComplianceDecision;
}

@Injectable()
export class ComplianceService {
    private readonly logger = new Logger(ComplianceService.name);

    private readonly blockedCountries: string[];
    private readonly sanctionedNames: string[];
    private readonly manualReviewThreshold: number;

    constructor(private readonly configService: ConfigService) {
        this.blockedCountries = this.configService.getOrThrow<string[]>('compliance.blockedCountries');
        this.sanctionedNames = this.configService.getOrThrow<string[]>('compliance.sanctionedNames');
        this.manualReviewThreshold = this.configService.getOrThrow<number>('compliance.manualReviewThreshold');
    }

    /**
     * Screens a transfer and returns the compliance decision.
     */
    screen(
        recipientCountry: string,
        recipientName: string,
        senderName: string,
        sendAmount: number,
        transferId: string,
    ): ComplianceResult {
        const triggeredRules: string[] = [];

        // Rule 1: Country blocklist
        if (this.blockedCountries.includes(recipientCountry.toUpperCase())) {
            triggeredRules.push(`BLOCKED_COUNTRY:${recipientCountry.toUpperCase()}`);
            this.logger.warn(
                `Transfer ${transferId}: compliance REJECTED — blocked country ${recipientCountry}`,
            );
            return {
                status: TransferStatus.COMPLIANCE_REJECTED,
                decision: {
                    decision: 'REJECTED',
                    triggeredRules,
                    timestamp: new Date(),
                },
            };
        }

        // Rule 2: Name screening
        const normalizedRecipient = recipientName.toUpperCase().trim();
        const normalizedSender = senderName.toUpperCase().trim();
        for (const sanctionedName of this.sanctionedNames) {
            if (
                normalizedRecipient.includes(sanctionedName) ||
                normalizedSender.includes(sanctionedName)
            ) {
                triggeredRules.push(`SANCTIONED_NAME:${sanctionedName}`);
                this.logger.warn(
                    `Transfer ${transferId}: compliance REJECTED — sanctioned name match`,
                );
                return {
                    status: TransferStatus.COMPLIANCE_REJECTED,
                    decision: {
                        decision: 'REJECTED',
                        triggeredRules,
                        timestamp: new Date(),
                    },
                };
            }
        }

        // Rule 3: Amount threshold
        if (sendAmount > this.manualReviewThreshold) {
            triggeredRules.push(`AMOUNT_THRESHOLD:${sendAmount}>${this.manualReviewThreshold}`);
            this.logger.log(
                `Transfer ${transferId}: compliance PENDING — amount ${sendAmount} exceeds threshold`,
            );
            return {
                status: TransferStatus.COMPLIANCE_PENDING,
                decision: {
                    decision: 'PENDING',
                    triggeredRules,
                    timestamp: new Date(),
                },
            };
        }

        // All clear
        this.logger.log(`Transfer ${transferId}: compliance APPROVED`);
        return {
            status: TransferStatus.COMPLIANCE_APPROVED,
            decision: {
                decision: 'APPROVED',
                triggeredRules: [],
                timestamp: new Date(),
            },
        };
    }
}
