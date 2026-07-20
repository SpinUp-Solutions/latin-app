export type TestServiceErrorCode =
  | 'TEST_ALREADY_EXISTS'
  | 'TEST_VERSION_ALREADY_EXISTS'
  | 'TEST_VERSION_NOT_FOUND'
  | 'TEST_VERSION_NOT_IN_TEST'
  | 'STALE_TEST_VERSION_DATA';

export class TestServiceError extends Error {
  constructor(
    public readonly code: TestServiceErrorCode,
    message: string,
    public readonly status: 404 | 409
  ) {
    super(message);
    this.name = 'TestServiceError';
  }
}
