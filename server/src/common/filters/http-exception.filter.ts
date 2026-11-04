import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { errorMessage, negotiateLocale } from '@riaya/shared';
import { REQUEST_ID_HEADER } from '../../logging/logging.config';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // FR-002 / FR-008: the id pino-http assigned to this request. Read it from
    // the request rather than generating a new one, so the body, the response
    // header and the log records all carry the same value (AC-002, AC-009).
    const requestId = this.resolveRequestId(request, response);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
        code = exception.name;
      } else if (typeof payload === 'object' && payload) {
        const body = payload as Record<string, unknown>;
        message = String(body.message ?? exception.message);
        code = String(body.code ?? exception.name);
        details = body.details ?? body.message;
        if (Array.isArray(body.message)) {
          message = 'Validation failed';
          code = 'VALIDATION_ERROR';
          details = body.message;
        }
      }
    } else {
      this.logger.error(
        `Unhandled error on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Localize the human-readable message, never the stable code (FR-001,
    // FR-002). An unknown code keeps the message the exception carried, so a
    // new error path degrades to English instead of leaking a raw key.
    const header = request.headers['accept-language'];
    const locale = negotiateLocale(Array.isArray(header) ? header[0] : header);
    message = errorMessage(code, locale) ?? message;

    // The shape stays as it was; `requestId` is the only addition (FR-008).
    response.status(status).json({
      code,
      message,
      details: details ?? null,
      requestId,
    });
  }

  /**
   * The correlation id for this response.
   *
   * `req.id` is set by pino-http's `genReqId`, which already validated any
   * client-supplied value (EC-002). The header is the fallback for the case
   * where the filter runs outside the pino middleware, so the body never
   * carries `null` on a request the client can trace.
   */
  private resolveRequestId(request: Request, response: Response): string | null {
    const fromRequest = (request as Request & { id?: unknown }).id;

    if (typeof fromRequest === 'string' && fromRequest.length > 0) {
      return fromRequest;
    }

    const fromHeader = response.getHeader(REQUEST_ID_HEADER);

    return typeof fromHeader === 'string' && fromHeader.length > 0 ? fromHeader : null;
  }
}
