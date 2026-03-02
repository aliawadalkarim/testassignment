import {
    Injectable,
    Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Transfer, TransferDocument } from '../schemas/transfer.schema';
import { TransferStatus } from '../../common/interfaces';
import { StateMachineService } from '../../state-machine/state-machine.service';
import { ComplianceService } from '../../compliance/compliance.service';
import { PayoutWorkflowService } from './payout-workflow.service';

@Injectable()
export class ComplianceWorkflowService {
    private readonly logger = new Logger(ComplianceWorkflowService.name);

    constructor(
        @InjectModel(Transfer.name)
        private readonly transferModel: Model<TransferDocument>,
        private readonly stateMachine: StateMachineService,
        private readonly complianceService: ComplianceService,
        private readonly payoutWorkflow: PayoutWorkflowService,
    ) { }

    /**
     * Run compliance screening and transition the transfer accordingly.
     * Called after a transfer is confirmed.
     */
    async runScreening(transfer: TransferDocument): Promise<TransferDocument> {
        const complianceResult = this.complianceService.screen(
            transfer.recipient.country,
            transfer.recipient.name,
            transfer.sender.name,
            transfer.sendAmount,
            transfer.transferId,
        );

        // Transition based on compliance result
        this.stateMachine.validateTransition(
            TransferStatus.CONFIRMED,
            complianceResult.status,
        );

        transfer.status = complianceResult.status;
        transfer.complianceDecision = complianceResult.decision;
        transfer.stateHistory.push({
            state: complianceResult.status,
            timestamp: new Date(),
            metadata: `Compliance: ${complianceResult.decision.decision} (rules: ${complianceResult.decision.triggeredRules.join(', ')})`,
        });
        transfer.version += 1;

        await this.payoutWorkflow.saveWithOptimisticLock(transfer);

        // If approved, initiate payout
        if (complianceResult.status === TransferStatus.COMPLIANCE_APPROVED) {
            await this.payoutWorkflow.initiatePayout(transfer);
        }

        return transfer;
    }

    /**
     * Approve compliance (manual review) and initiate payout.
     */
    async approve(
        transfer: TransferDocument,
        reviewerId?: string,
        reason?: string,
    ): Promise<TransferDocument> {
        this.stateMachine.validateTransition(
            transfer.status as TransferStatus,
            TransferStatus.COMPLIANCE_APPROVED,
        );

        transfer.status = TransferStatus.COMPLIANCE_APPROVED;
        transfer.complianceDecision = {
            decision: 'APPROVED',
            triggeredRules: transfer.complianceDecision?.triggeredRules || [],
            timestamp: new Date(),
            reviewerId,
        };
        transfer.stateHistory.push({
            state: TransferStatus.COMPLIANCE_APPROVED,
            timestamp: new Date(),
            metadata: `Manual approval by ${reviewerId || 'unknown'}${reason ? `: ${reason}` : ''}`,
        });
        transfer.version += 1;

        await this.payoutWorkflow.saveWithOptimisticLock(transfer);

        this.logger.log(`Transfer ${transfer.transferId} compliance approved by ${reviewerId}`);

        // Initiate payout
        await this.payoutWorkflow.initiatePayout(transfer);

        return transfer;
    }

    /**
     * Reject compliance (manual review).
     */
    async reject(
        transfer: TransferDocument,
        reviewerId?: string,
        reason?: string,
    ): Promise<TransferDocument> {
        this.stateMachine.validateTransition(
            transfer.status as TransferStatus,
            TransferStatus.COMPLIANCE_REJECTED,
        );

        transfer.status = TransferStatus.COMPLIANCE_REJECTED;
        transfer.complianceDecision = {
            decision: 'REJECTED',
            triggeredRules: transfer.complianceDecision?.triggeredRules || [],
            timestamp: new Date(),
            reviewerId,
        };
        transfer.stateHistory.push({
            state: TransferStatus.COMPLIANCE_REJECTED,
            timestamp: new Date(),
            metadata: `Manual rejection by ${reviewerId || 'unknown'}${reason ? `: ${reason}` : ''}`,
        });
        transfer.version += 1;

        await this.payoutWorkflow.saveWithOptimisticLock(transfer);

        this.logger.log(`Transfer ${transfer.transferId} compliance rejected by ${reviewerId}`);
        return transfer;
    }
}
