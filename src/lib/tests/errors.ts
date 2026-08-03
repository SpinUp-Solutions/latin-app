export type TestServiceErrorCode =
  | 'TEST_NOT_FOUND'
  | 'STALE_TEST_DATA'
  | 'TEST_ALREADY_EXISTS'
  | 'TEST_VERSION_ALREADY_EXISTS'
  | 'TEST_VERSION_NOT_FOUND'
  | 'TEST_VERSION_NOT_IN_TEST'
  | 'STALE_TEST_VERSION_DATA'
  | 'TEST_NOT_AVAILABLE'
  | 'MOCK_TEST_NOT_FOUND'
  | 'MOCK_TEST_NOT_AVAILABLE'
  | 'TEST_CONFIGURATION_ERROR'
  | 'ATTEMPT_NOT_FOUND'
  | 'ATTEMPT_NOT_IN_PROGRESS'
  | 'ATTEMPT_ANSWER_INVALID'
  | 'ATTEMPT_GRADING_UNAVAILABLE'
  | 'ATTEMPT_TOO_LARGE'
  | 'STALE_TEST_ATTEMPT_DATA'
  | 'MOCK_TEST_ALREADY_EXISTS'
  | 'VERSION_ALREADY_ASSIGNED'
  | 'PLACED_TEST_REQUIRES_ROTATION_VERSION'
  | 'MOCK_TEST_INVALID_OPERATION';

export class TestServiceError extends Error {
  constructor(
    public readonly code: TestServiceErrorCode,
    message: string,
    public readonly status: 400 | 404 | 409 | 422 | 503
  ) {
    super(message);
    this.name = 'TestServiceError';
  }
}
