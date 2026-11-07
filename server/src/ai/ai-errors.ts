import { HttpException, HttpStatus } from '@nestjs/common';

export class AiUnavailableException extends HttpException {
  constructor(reason = 'NOT_CONFIGURED') {
    super(
      {
        code: 'AI_UNAVAILABLE',
        message: 'The assistant is not available right now',
        details: { reason },
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

/**
 * 429 with its own code. Controllers answer it directly: the global filter maps every 429 to
 * RATE_LIMITED.
 */
export class AiBudgetExceededException extends HttpException {
  constructor() {
    super(
      {
        code: 'AI_BUDGET_EXCEEDED',
        message: 'The daily assistant budget of this clinic is used up',
        details: null,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
