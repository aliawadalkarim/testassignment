import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { Transfer, TransferDocument } from './schemas/transfer.schema';
import { TransferStatus } from '../common/interfaces';
import { StateMachineService } from '../state-machine/state-machine.service';
import { ComplianceService } from '../compliance/compliance.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import configuration from '../common/config/configuration';

@Injectable()
export class TransfersService {
    private readonly logger = new Logger(TransfersService.name);
    private readonly config = configuration();

    constructor(
        @InjectModel(Transfer.name)
        private readonly transferModel: Model<TransferDocument>,
        private readonly stateMachine: StateMachineService,
        private readonly complianceService: ComplianceService,
    ) { }

    /**
     * Create a new transfer, fetch a quote, and transition to QUOTED.
     */
    async create(dto: CreateTransferDto): Promise<TransferDocument> {
        const transferId = uuidv4();

        this.logger.log(`Creating transfer ${transferId}`);

        // Create transfer in CREATED state
        const transfer = new this.transferModel({
            transferId,
            sender: dto.sender,
            recipient: dto.recipient,
            sendAmount: dto.sendAmount,
            sendCurrency: dto.sendCurrency,
            payoutCurrency: dto.payoutCurrency,
            status: TransferStatus.CREATED,
            stateHistory: [
                { state: TransferStatus.CREATED, timestamp: new Date() },
            ],
            version: 0,
        });

        await transfer.save();

        // Fetch quote from FX service
        try {
            const quoteResponse = await axios.post(
                `${this.config.fxServiceUrl}/quote`,
                {
                    sendAmount: dto.sendAmount,
                    sendCurrency: dto.sendCurrency,
                    payoutCurrency: dto.payoutCurrency,
                    destinationCountry: dto.recipient.country,
                    payoutMethod: dto.recipient.payoutMethod,
                },
                { timeout: 5000 },
            );

            const quote = quoteResponse.data;

            // Transition to QUOTED
            this.stateMachine.validateTransition(
                TransferStatus.CREATED,
                TransferStatus.QUOTED,
            );

            transfer.quote = {
                quoteId: quote.quoteId,
                rate: quote.rate,
                fee: quote.fee,
                payoutAmount: quote.payoutAmount,
                sendAmount: quote.sendAmount,
                sendCurrency: quote.sendCurrency,
                payoutCurrency: quote.payoutCurrency,
                expiresAt: new Date(quote.expiresAt),
            };
            transfer.status = TransferStatus.QUOTED;
            transfer.stateHistory.push({
                state: TransferStatus.QUOTED,
                timestamp: new Date(),
                metadata: `Quote ${quote.quoteId} received`,
            });
            transfer.version += 1;

            await transfer.save();
            this.logger.log(`Transfer ${transferId} quoted (quoteId: ${quote.quoteId})`);
        } catch (error) {
            this.logger.error(
                `Failed to fetch quote for transfer ${transferId}: ${error instanceof Error ? error.message : error}`,
            );
            throw new BadRequestException('Failed to obtain FX quote');
        }

        return transfer;
    }

    /**
     * Get transfer by ID.
     */
    async findById(transferId: string): Promise<TransferDocument> {
        const transfer = await this.transferModel.findOne({ transferId }).exec();
        if (!transfer) {
            throw new NotFoundException(`Transfer ${transferId} not found`);
        }
        return transfer;
    }

    /**
     * List transfers, optionally filtered by senderId.
     */
    async findAll(senderId?: string): Promise<TransferDocument[]> {
        const filter: Record<string, unknown> = {};
        if (senderId) {
            filter['sender.senderId'] = senderId;
        }
        return this.transferModel.find(filter).sort({ createdAt: -1 }).exec();
    }

    /**
     * Confirm a transfer: lock the quote snapshot and run compliance.
     */
    async confirm(transferId: string): Promise<TransferDocument> {
        const transfer = await this.findById(transferId);

        // Validate state
        this.stateMachine.validateTransition(
            transfer.status as TransferStatus,
            TransferStatus.CONFIRMED,
        );

        // Check quote expiry
        if (!transfer.quote) {
            throw new BadRequestException('Transfer has no quote');
        }

        if (new Date() > new Date(transfer.quote.expiresAt)) {
            throw new BadRequestException(
                'Quote has expired. Please create a new transfer.',
            );
        }

        // Lock the quote snapshot (immutable from this point)
        transfer.confirmedQuoteSnapshot = { ...transfer.quote };

        // Transition to CONFIRMED
        transfer.status = TransferStatus.CONFIRMED;
        transfer.stateHistory.push({
            state: TransferStatus.CONFIRMED,
            timestamp: new Date(),
            metadata: 'Quote locked',
        });
        transfer.version += 1;

        await this.saveWithOptimisticLock(transfer);

        this.logger.log(`Transfer ${transferId} confirmed`);

        // Run compliance screening
        const complianceResult = this.complianceService.screen(
            transfer.recipient.country,
            transfer.recipient.name,
            transfer.sender.name,
            transfer.sendAmount,
            transferId,
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

        await this.saveWithOptimisticLock(transfer);

        // If approved, initiate payout
        if (complianceResult.status === TransferStatus.COMPLIANCE_APPROVED) {
            await this.initiatePayout(transfer);
        }

        return transfer;
    }

    /**
     * Cancel a transfer (only from CREATED or QUOTED).
     */
    async cancel(transferId: string): Promise<TransferDocument> {
        const transfer = await this.findById(transferId);

        this.stateMachine.validateTransition(
            transfer.status as TransferStatus,
            TransferStatus.CANCELLED,
        );

        transfer.status = TransferStatus.CANCELLED;
        transfer.stateHistory.push({
            state: TransferStatus.CANCELLED,
            timestamp: new Date(),
        });
        transfer.version += 1;

        await this.saveWithOptimisticLock(transfer);

        this.logger.log(`Transfer ${transferId} cancelled`);
        return transfer;
    }

    /**
     * Approve compliance (manual review) and initiate payout.
     */
    async complianceApprove(
        transferId: string,
        reviewerId?: string,
        reason?: string,
    ): Promise<TransferDocument> {
        const transfer = await this.findById(transferId);

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

        await this.saveWithOptimisticLock(transfer);

        this.logger.log(`Transfer ${transferId} compliance approved by ${reviewerId}`);

        // Initiate payout
        await this.initiatePayout(transfer);

        return transfer;
    }

    /**
     * Reject compliance (manual review).
     */
    async complianceReject(
        transferId: string,
        reviewerId?: string,
        reason?: string,
    ): Promise<TransferDocument> {
        const transfer = await this.findById(transferId);

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

        await this.saveWithOptimisticLock(transfer);

        this.logger.log(`Transfer ${transferId} compliance rejected by ${reviewerId}`);
        return transfer;
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
            transfer.final = {
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
            transfer.final = {
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
     * Get transfer counts by status (basic metrics).
     */
    async getMetrics(): Promise<Record<string, number>> {
        const result = await this.transferModel.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);

        const metrics: Record<string, number> = {};
        for (const entry of result) {
            metrics[entry._id] = entry.count;
        }
        metrics.total = Object.values(metrics).reduce((a, b) => a + b, 0);
        return metrics;
    }

    /**
     * Initiate payout by calling the payout partner simulator.
     */
    private async initiatePayout(transfer: TransferDocument): Promise<void> {
        this.stateMachine.validateTransition(
            transfer.status as TransferStatus,
            TransferStatus.PAYOUT_PENDING,
        );

        try {
            const response = await axios.post(
                `${this.config.payoutServiceUrl}/partner/payouts`,
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
     * Save with optimistic concurrency control.
     * Checks the version field to prevent lost updates.
     */
    private async saveWithOptimisticLock(
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
                        final: transfer.final,
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
