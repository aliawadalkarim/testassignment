import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let error = 'Internal Server Error';

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            if (typeof exceptionResponse === 'string') {
                message = exceptionResponse;
                error = exception.name;
            } else if (typeof exceptionResponse === 'object') {
                const resp = exceptionResponse as Record<string, unknown>;
                message = (resp.message as string) || message;
                error = (resp.error as string) || error;
            }
        } else if (exception instanceof Error) {
            message = exception.message;
        }

        this.logger.error(
            JSON.stringify({
                statusCode: status,
                path: request.url,
                method: request.method,
                message,
                transferId: request.params?.id,
                timestamp: new Date().toISOString(),
            }),
        );

        response.status(status).json({
            statusCode: status,
            error,
            message,
            path: request.url,
            timestamp: new Date().toISOString(),
        });
    }
}
