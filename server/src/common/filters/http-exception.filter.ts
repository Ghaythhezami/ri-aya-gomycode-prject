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
import { pathOnly, REQUEST_ID_HEADER } from '../../logging/logging.config';

/** A Prisma error, matched structurally so the memory driver and the real client behave alike. */
interface PrismaLikeError {
  name: string;
  code?: string;
  meta?: { target?: unknown };
}

function asPrismaError(exception: unknown): PrismaLikeError | null {
  if (!(exception instanceof Error)) return null;
  if (!exception.name.startsWith('PrismaClient')) return null;
  return exception as PrismaLikeError;
}

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
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        // Keep deliberate 429 codes (AI budget); throttler 429s become RATE_LIMITED.
        if (code !== 'AI_BUDGET_EXCEEDED' && code !== 'QUOTA_EXCEEDED') code = 'RATE_LIMITED';
        details = undefined;
      } else if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        // Multer's file-size limit: same contract as a rejected document type.
        status = HttpStatus.UNPROCESSABLE_ENTITY;
        code = 'DOCUMENT_INVALID';
        message = 'Upload a PDF, JPEG or PNG file of up to 10 MB';
        details = undefined;
      } else if (status >= 500 && !(payload as { code?: unknown } | null)?.code) {
        // A framework 5xx without a stable code must not echo its internal message.
        code = 'INTERNAL_ERROR';
        message = 'An unexpected error occurred';
        details = undefined;
      }
    } else {
      const prismaError = asPrismaError(exception);
      if (prismaError?.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'Not found';
      } else if (prismaError?.code === 'P2002' || prismaError?.code === 'P2003') {
        status = HttpStatus.CONFLICT;
        code = 'CONFLICT';
        message = 'The request conflicts with existing data';
      } else {
        // Anything else (unknown Prisma error, driver error, bug) is a generic 500:
        // the body never carries SQL, table names, stack frames or the raw message.
        this.logUnhandled(request, exception, prismaError);
      }
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
   * Log an unexpected error without personal data. Prisma messages embed the
   * failing query arguments (patient names, phones), so only the error class and
   * code are logged for them; other errors keep their stack, which is the
   * diagnostic the on-call needs. The URL is logged without its query string.
   */
  private logUnhandled(request: Request, exception: unknown, prismaError: PrismaLikeError | null) {
    const where = `${request.method} ${pathOnly(request.url)}`;
    if (prismaError) {
      this.logger.error(
        `Database error on ${where}: ${prismaError.name} ${prismaError.code ?? ''}`.trim(),
      );
      return;
    }
    this.logger.error(
      `Unhandled error on ${where}`,
      exception instanceof Error ? exception.stack : undefined,
    );
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
