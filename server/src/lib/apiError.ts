/**
 * Every API error response is { code, message, field? } — never a raw
 * Prisma/driver error, never a stack trace. See errorHandler.ts.
 */
export class ApiError extends Error {
  statusCode: number;
  code: string;
  field?: string;

  constructor(statusCode: number, code: string, message: string, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    if (field !== undefined) this.field = field;
  }

  static badRequest(message: string, field?: string) {
    return new ApiError(400, 'BAD_REQUEST', message, field);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string) {
    return new ApiError(409, 'CONFLICT', message);
  }
  static tooManyRequests(message = 'Too many requests, please try again later') {
    return new ApiError(429, 'RATE_LIMITED', message);
  }
}
