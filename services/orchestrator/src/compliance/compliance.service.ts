import { Injectable, Logger } from '@nestjs/common';
import { TransferStatus, IComplianceDecision } from '../common/interfaces';

// Sanctioned countries
const BLOCKED_COUNTRIES = ['KP', 'IR', 'SY', 'CU'];

// Sanctioned names (simple simulation)
const SANCTIONED_NAMES = [
    'JOHN DOE SANCTIONED',
    'JANE TERRORIST',
    'BLOCKED PERSON',
    'SANCTIONED INDIVIDUAL',
];

// Amount threshold for manual review
const MANUAL_REVIEW_THRESHOLD = 10000;

export interface ComplianceResult {
    status: TransferStatus.COMPLIANCE_APPROVED | TransferStatus.COMPLIANCE_PENDING | TransferStatus.COMPLIANCE_REJECTED;
    decision: IComplianceDecision;
}

@Injectable()
export class ComplianceService {
    private readonly logger = new Logger(ComplianceService.name);

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
        if (BLOCKED_COUNTRIES.includes(recipientCountry.toUpperCase())) {
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
        for (const sanctionedName of SANCTIONED_NAMES) {
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
        if (sendAmount > MANUAL_REVIEW_THRESHOLD) {
            triggeredRules.push(`AMOUNT_THRESHOLD:${sendAmount}>${MANUAL_REVIEW_THRESHOLD}`);
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
                triggeredRules: ['NONE'],
                timestamp: new Date(),
            },
        };
    }
}
