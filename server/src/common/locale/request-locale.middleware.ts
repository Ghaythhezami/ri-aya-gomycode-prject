import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { parseAcceptLanguage, RequestLocale } from './request-locale';

/** Opens the request-language frame read by the mappers (ADR 0004 section 3). */
@Injectable()
export class RequestLocaleMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    RequestLocale.run(parseAcceptLanguage(req.headers['accept-language']), next);
  }
}
