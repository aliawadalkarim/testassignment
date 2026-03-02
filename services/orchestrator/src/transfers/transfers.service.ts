import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Transfer, TransferDocument } from './schemas/transfer.schema';
import { TransferStatus } from '../common/interfaces';
import { StateMachineService } from '../state-machine/state-machine.service';
import { PayoutWorkflowService } from './services/payout-workflow.service';
import { ComplianceWorkflowService } from './services/compliance-workflow.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Injectable()
export class TransfersService {
    private readonly logger = new Logger(TransfersService.name);

    constructor(
        @InjectModel(Transfer.name)
        private readonly transferModel: Model<TransferDocument>,
        private readonly stateMachine: StateMachineService,
        private readonly payoutWorkflow: PayoutWorkflowService,
        private readonly complianceWorkflow: ComplianceWorkflowService,
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) { }

    /**
     * Create a new transfer, fetch a quote, and persist in QUOTED state.
     *
     * The quote is fetched BEFORE persisting to avoid orphaned CREATED records
     * when the FX service is unreachable. Supports idempotency keys for safe retries.
     */
    async create(dto: CreateTransferDto, idempotencyKey?: string): Promise<TransferDocument> {
        if (idempotencyKey) {
            const existing = await this.transferModel.findOne({ idempotencyKey, 'sender.senderId': dto.sender.senderId }).exec();
            if (existing) {
                this.logger.log(`Idempotency hit: returning existing transfer ${existing.transferId} for key ${idempotencyKey}`);
                return existing;
            }
        }

        const transferId = uuidv4();

        this.logger.log(`Creating transfer ${transferId}${idempotencyKey ? ` (idempotencyKey: ${idempotencyKey})` : ''}`);

        // Fetch quote from FX service BEFORE persisting the transfer
        let quote: Record<string, unknown>;
        try {
            const fxServiceUrl = this.configService.get<string>('fxServiceUrl');
            const quoteResponse = await this.httpService.axiosRef.post(
                `${fxServiceUrl}/quote`,
                {
                    sendAmount: dto.sendAmount,
                    sendCurrency: dto.sendCurrency,
                    payoutCurrency: dto.payoutCurrency,
                    destinationCountry: dto.recipient.country,
                    payoutMethod: dto.recipient.payoutMethod,
                },
                { timeout: 5000 },
            );
            quote = quoteResponse.data;
        } catch (error) {
            this.logger.error(
                `Failed to fetch quote for transfer ${transferId}: ${error instanceof Error ? error.message : error}`,
            );
            throw new BadRequestException('Failed to obtain FX quote');
        }

        // Validate the state transition
        this.stateMachine.validateTransition(
            TransferStatus.CREATED,
            TransferStatus.QUOTED,
        );

        // Persist transfer directly in QUOTED state with quote attached
        const transfer = new this.transferModel({
            transferId,
            idempotencyKey,
            sender: dto.sender,
            recipient: dto.recipient,
            sendAmount: dto.sendAmount,
            sendCurrency: dto.sendCurrency,
            payoutCurrency: dto.payoutCurrency,
            status: TransferStatus.QUOTED,
            quote: {
                quoteId: quote.quoteId,
                rate: quote.rate,
                fee: quote.fee,
                payoutAmount: quote.payoutAmount,
                sendAmount: quote.sendAmount,
                sendCurrency: quote.sendCurrency,
                payoutCurrency: quote.payoutCurrency,
                expiresAt: new Date(quote.expiresAt as string),
            },
            stateHistory: [
                { state: TransferStatus.CREATED, timestamp: new Date() },
                {
                    state: TransferStatus.QUOTED,
                    timestamp: new Date(),
                    metadata: `Quote ${quote.quoteId} received`,
                },
            ],
            version: 1,
        });

        await transfer.save();
        this.logger.log(`Transfer ${transferId} quoted (quoteId: ${quote.quoteId})`);

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
     * List transfers with optional senderId filter and pagination.
     */
    async findAll(
        senderId?: string,
        page = 1,
        limit = 20,
    ): Promise<{ data: TransferDocument[]; total: number; page: number; limit: number }> {
        const filter: Record<string, unknown> = {};
        if (senderId) {
            filter['sender.senderId'] = senderId;
        }

        const [data, total] = await Promise.all([
            this.transferModel
                .find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .exec(),
            this.transferModel.countDocuments(filter).exec(),
        ]);

        return { data, total, page, limit };
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
        transfer.confirmedQuoteSnapshot = structuredClone(transfer.quote);

        // Transition to CONFIRMED
        transfer.status = TransferStatus.CONFIRMED;
        transfer.stateHistory.push({
            state: TransferStatus.CONFIRMED,
            timestamp: new Date(),
            metadata: 'Quote locked',
        });
        transfer.version += 1;

        await this.payoutWorkflow.saveWithOptimisticLock(transfer);

        this.logger.log(`Transfer ${transferId} confirmed`);

        // Run compliance screening (delegates to ComplianceWorkflowService)
        await this.complianceWorkflow.runScreening(transfer);

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

        await this.payoutWorkflow.saveWithOptimisticLock(transfer);

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
        return this.complianceWorkflow.approve(transfer, reviewerId, reason);
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
        return this.complianceWorkflow.reject(transfer, reviewerId, reason);
    }

    /**
     * Handle webhook from payout partner.
     */
    async handlePayoutWebhook(
        partnerPayoutId: string,
        status: 'PAID' | 'FAILED',
        amount: number,
    ): Promise<TransferDocument> {
        return this.payoutWorkflow.handlePayoutWebhook(partnerPayoutId, status, amount);
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
}
