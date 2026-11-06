import { UnprocessableEntityException } from '@nestjs/common';

/** 422 with the shared VALIDATION_FAILED code. */
export function unprocessable(message: string, details?: unknown) {
  return new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message, details });
}
