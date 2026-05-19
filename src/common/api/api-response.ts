export interface ApiListPagination {
  limit: number;
  nextCursor: string | null;
}

export interface ApiSuccessResponse<T> {
  data: T;
}

export interface ApiListResponse<T> {
  data: T[];
  pagination: ApiListPagination;
}

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    details: Record<string, unknown>;
  };
}

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'provider_error'
  | 'internal_error'
  | 'insufficient_balance'
  | 'rate_limited'
  | 'conflict';

export function success<T>(data: T): ApiSuccessResponse<T> {
  return { data };
}

export function list<T>(
  data: T[],
  pagination: ApiListPagination = { limit: 50, nextCursor: null },
): ApiListResponse<T> {
  return { data, pagination };
}

export function parseLimit(value: string | undefined, defaultLimit = 50, maxLimit = 100) {
  if (!value) {
    return defaultLimit;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return defaultLimit;
  }

  return Math.min(parsed, maxLimit);
}
