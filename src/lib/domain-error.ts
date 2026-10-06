/**
 * An expected failure with a stable machine-readable `code` and the HTTP status
 * it maps to. `routeErrorResponse` turns any DomainError into a response and
 * treats every other error as unexpected.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;
  /** Extra response fields, such as the exercises a lesson is still missing. */
  readonly details?: Record<string, unknown>;
}

/** A domain error for code that does not need a class of its own. */
export class RequestError extends DomainError {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RequestError';
  }
}
