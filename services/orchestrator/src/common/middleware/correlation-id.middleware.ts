import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware that attaches a unique correlation ID to every request.
 * If the incoming request has an X-Correlation-Id header, it is reused;
 * otherwise a new UUID is generated. The ID is set on both the request
 * and the response headers for distributed tracing.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
    private readonly logger = new Logger(CorrelationIdMiddleware.name);

    use(req: Request, res: Response, next: NextFunction): void {
        const correlationId =
            (req.headers['x-correlation-id'] as string) || uuidv4();

        req.headers['x-correlation-id'] = correlationId;
        res.setHeader('X-Correlation-Id', correlationId);

        next();
    }
}
