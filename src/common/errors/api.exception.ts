import { HttpException, HttpStatus } from '@nestjs/common';

import type { ApiErrorCode, ApiErrorResponse } from '../api/api-response';

export class ApiException extends HttpException {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details: Record<string, unknown> = {},
  ) {
    const response: ApiErrorResponse = {
      error: {
        code,
        message,
        details,
      },
    };

    super(response, status);
  }
}
