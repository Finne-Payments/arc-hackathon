/* ============================================================================
   Canonical error envelope (BE-01 step 4).
   Every error has code, message, requestId, retryable, and safe optional details.
   ========================================================================== */

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ILLEGAL_TRANSITION"
  | "APPEND_ONLY_VIOLATION"
  | "IDEMPOTENCY_CONFLICT"
  | "VALIDATION_ERROR"
  | "FORBIDDEN_VERDICT"
  | "CHAIN_NOT_CONFIGURED"
  | "VERIFICATION_REJECTED"
  | "CORRECTION_MISMATCH"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable: boolean = false,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function unauthorized(message = "Authentication required or invalid."): ApiError {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "The actor lacks permission for this resource."): ApiError {
  return new ApiError(403, "FORBIDDEN", message);
}

export function notFound(message = "Resource not found."): ApiError {
  return new ApiError(404, "NOT_FOUND", message, false);
}

export function illegalTransition(message: string): ApiError {
  return new ApiError(409, "ILLEGAL_TRANSITION", message, false);
}

export function appendOnlyViolation(message: string): ApiError {
  return new ApiError(409, "APPEND_ONLY_VIOLATION", message, false);
}

export function idempotencyConflict(message: string): ApiError {
  return new ApiError(409, "IDEMPOTENCY_CONFLICT", message, false);
}

export function validationError(message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError(400, "VALIDATION_ERROR", message, false, details);
}

export function forbiddenVerdict(message: string): ApiError {
  return new ApiError(422, "FORBIDDEN_VERDICT", message, false);
}

export function chainNotConfigured(message = "Chain contracts are not configured."): ApiError {
  return new ApiError(503, "CHAIN_NOT_CONFIGURED", message, true);
}

export function verificationRejected(reason: string): ApiError {
  return new ApiError(422, "VERIFICATION_REJECTED", reason, false);
}

export function correctionMismatch(reason: string): ApiError {
  return new ApiError(409, "CORRECTION_MISMATCH", reason, false);
}

export function internalError(message = "Something went wrong on our side. Nothing has changed on chain."): ApiError {
  return new ApiError(500, "INTERNAL_ERROR", message, true);
}

/** The canonical error response body. */
export interface ErrorBody {
  code: ErrorCode;
  message: string;
  requestId: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

/** Generate a request ID (short, unique). */
export function generateRequestId(): string {
  return "req_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
