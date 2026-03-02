import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Model } from 'mongoose';
import { Transfer, TransferDocument } from '../schemas/transfer.schema';
import { TransferStatus } from '../../common/interfaces';
import { StateMachineService } from '../../state-machine/state-machine.service';

@Injectable()
export class PayoutWorkflowService {
    private readonly logger = new Logger(PayoutWorkflowService.name);

    constructor(
        @InjectModel(Transfer.name)
        private readonly transferModel: Model<TransferDocument>,
        private readonly stateMachine: StateMachineService,
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) { }

    /**
     * Initiate payout by calling the payout partner simulator.
     */
    async initiatePayout(transfer: TransferDocument): Promise<void> {
        this.stateMachine.validateTransition(
            transfer.status as TransferStatus,
            TransferStatus.PAYOUT_PENDING,
        );

        try {
            const payoutServiceUrl = this.configService.get<string>('payoutServiceUrl');
            const response = await this.httpService.axiosRef.post(
                `${payoutServiceUrl}/partner/payouts`,
                {
                    transferId: transfer.transferId,
                    amount: transfer.confirmedQuoteSnapshot!.payoutAmount,
                    currency: transfer.payoutCurrency,
                    recipientName: transfer.recipient.name,
                    payoutMethod: transfer.recipient.payoutMethod,
                },
                { timeout: 5000 },
            );

            transfer.partnerPayoutId = response.data.partnerPayoutId;
            transfer.status = TransferStatus.PAYOUT_PENDING;
            transfer.stateHistory.push({
                state: TransferStatus.PAYOUT_PENDING,
                timestamp: new Date(),
                metadata: `Payout initiated: ${response.data.partnerPayoutId}`,
            });
            transfer.version += 1;

            await this.saveWithOptimisticLock(transfer);

            this.logger.log(
                `Transfer ${transfer.transferId} payout initiated (${response.data.partnerPayoutId})`,
            );
        } catch (error) {
            this.logger.error(
                `Failed to initiate payout for transfer ${transfer.transferId}: ${error instanceof Error ? error.message : error}`,
            );
            throw new BadRequestException(
                'Failed to initiate payout with partner. Please retry.',
            );
        }
    }

    /**
     * Handle webhook from payout partner.
     * Idempotent: ignores duplicate webhooks for already-terminal states.
     */
    async handlePayoutWebhook(
        partnerPayoutId: string,
        status: 'PAID' | 'FAILED',
        amount: number,
    ): Promise<TransferDocument> {
        const transfer = await this.transferModel
            .findOne({ partnerPayoutId })
            .exec();

        if (!transfer) {
            throw new NotFoundException(
                `Transfer with partnerPayoutId ${partnerPayoutId} not found`,
            );
        }

        const currentStatus = transfer.status as TransferStatus;

        // Idempotency: if already in terminal state, ignore duplicate webhook
        if (this.stateMachine.isTerminalState(currentStatus)) {
            this.logger.warn(
                `Ignoring duplicate webhook for transfer ${transfer.transferId} (already ${currentStatus})`,
            );
            return transfer;
        }

        if (status === 'PAID') {
            this.stateMachine.validateTransition(currentStatus, TransferStatus.PAID);

            transfer.status = TransferStatus.PAID;
            transfer.financialSummary = {
                paidAmount: amount,
                feesCharged: transfer.confirmedQuoteSnapshot?.fee,
            };
            transfer.stateHistory.push({
                state: TransferStatus.PAID,
                timestamp: new Date(),
                metadata: `Payout confirmed: ${amount} ${transfer.payoutCurrency}`,
            });
        } else {
            this.stateMachine.validateTransition(currentStatus, TransferStatus.FAILED);

            transfer.status = TransferStatus.FAILED;
            transfer.stateHistory.push({
                state: TransferStatus.FAILED,
                timestamp: new Date(),
                metadata: 'Payout failed',
            });
            transfer.version += 1;
            await this.saveWithOptimisticLock(transfer);

            // Auto-refund on failure
            this.stateMachine.validateTransition(
                TransferStatus.FAILED,
                TransferStatus.REFUNDED,
            );

            transfer.status = TransferStatus.REFUNDED;
            transfer.financialSummary = {
                refundedAmount: transfer.sendAmount,
                feesCharged: 0,
            };
            transfer.stateHistory.push({
                state: TransferStatus.REFUNDED,
                timestamp: new Date(),
                metadata: `Auto-refunded ${transfer.sendAmount} ${transfer.sendCurrency}`,
            });
        }

        transfer.version += 1;
        await this.saveWithOptimisticLock(transfer);

        this.logger.log(
            `Transfer ${transfer.transferId} webhook processed: ${status} → ${transfer.status}`,
        );

        return transfer;
    }

    /**
     * Save with optimistic concurrency control.
     */
    async saveWithOptimisticLock(
        transfer: TransferDocument,
    ): Promise<void> {
        const expectedVersion = transfer.version;
        const result = await this.transferModel
            .findOneAndUpdate(
                {
                    transferId: transfer.transferId,
                    version: expectedVersion - 1,
                },
                {
                    $set: {
                        status: transfer.status,
                        stateHistory: transfer.stateHistory,
                        quote: transfer.quote,
                        confirmedQuoteSnapshot: transfer.confirmedQuoteSnapshot,
                        financialSummary: transfer.financialSummary,
                        complianceDecision: transfer.complianceDecision,
                        partnerPayoutId: transfer.partnerPayoutId,
                        version: expectedVersion,
                    },
                },
                { new: true },
            )
            .exec();

        if (!result) {
            throw new ConflictException(
                `Optimistic lock failed for transfer ${transfer.transferId}. Concurrent modification detected.`,
            );
        }
    }
}
