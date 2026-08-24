import * as Sentry from '@sentry/nextjs';
import { getApiErrorCode } from '@/src/store/api/baseQuery';

const EXPECTED_ERROR_CODES = new Set([
  'LESSON_LOCKED',
  'LESSON_NOT_FOUND',
  'TEST_NOT_AVAILABLE',
  'TEST_CONFIGURATION_ERROR',
  'VALIDATION_ERROR',
  'STUDENT_LESSON_LIST_RETIRED',
]);

export type ReportErrorContext = {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  level?: Sentry.SeverityLevel;
};

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

export function getErrorStatus(error: unknown): number | string | undefined {
  if (!isObject(error) || !('status' in error)) return undefined;
  const status = error.status;
  return typeof status === 'number' || typeof status === 'string' ? status : undefined;
}

function getErrorCode(error: unknown): string | undefined {
  const fromApi = getApiErrorCode(error);
  if (fromApi) return fromApi;
  if (isObject(error) && typeof error.code === 'string') return error.code;
  return undefined;
}

/** Expected client/API control-flow failures that should not create Sentry issues. */
export function isExpectedApiError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 401 || status === 403 || status === 404 || status === 400 || status === 422) {
    return true;
  }

  if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
    if (error.status >= 400 && error.status < 500) return true;
  }

  const code = getErrorCode(error);
  return Boolean(code && EXPECTED_ERROR_CODES.has(code));
}

export function isClientFetchOrParseFailure(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status === 'FETCH_ERROR' || status === 'PARSING_ERROR' || status === 'TIMEOUT_ERROR';
}

/**
 * Whether a client hard-fail UI should report to Sentry.
 * Skips expected 4xx and skips numeric 5xx (the API route should already have reported).
 */
export function shouldReportClientHardFail(error: unknown): boolean {
  if (isExpectedApiError(error)) return false;
  const status = getErrorStatus(error);
  if (typeof status === 'number' && status >= 500) return false;
  if (isClientFetchOrParseFailure(error)) return true;
  return status === undefined;
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error('Unknown error');
  }
}

/** Report an unexpected failure, skipping known expected API/domain errors. */
export function reportUnexpectedError(error: unknown, context?: ReportErrorContext): void {
  if (isExpectedApiError(error)) return;
  Sentry.captureException(toError(error), {
    level: context?.level ?? 'error',
    tags: context?.tags,
    extra: context?.extra,
  });
}

/**
 * Report a failure already classified as unexpected by the caller
 * (e.g. the generic 500 branch after domain errors were filtered).
 */
export function reportServerUnexpectedError(error: unknown, context?: ReportErrorContext): void {
  Sentry.captureException(toError(error), {
    level: context?.level ?? 'error',
    tags: context?.tags,
    extra: context?.extra,
  });
}
