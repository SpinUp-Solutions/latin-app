export type LearningPathServiceErrorCode =
  | 'LEARNING_PATH_NOT_FOUND'
  | 'STALE_LEARNING_PATH_DATA'
  | 'STALE_LEARNING_PATH_REVISION'
  | 'LEARNING_PATH_FROZEN'
  | 'UNKNOWN_LEARNING_UNIT'
  | 'INELIGIBLE_LEARNING_UNIT'
  | 'LEARNING_PATH_TOO_LARGE'
  | 'PLACED_UNIT_DELETE'
  | 'PLACED_UNIT_INVALID'
  | 'INVALID_LEGACY_NORMAL_ORDER'
  | 'MIGRATION_SOURCE_CHANGED'
  | 'MIGRATION_CONFLICT'
  | 'CUTOVER_NOT_ACTIVE'
  | 'ROLLBACK_UNAVAILABLE'
  | 'PHASE5_TEST_PRESENT'
  | 'LEGACY_NORMAL_PLACEMENT_RETIRED'
  | 'VERIFICATION_FAILED';

export class LearningPathServiceError extends Error {
  constructor(
    public readonly code: LearningPathServiceErrorCode,
    message: string,
    public readonly status: 400 | 404 | 409 | 422
  ) {
    super(message);
    this.name = 'LearningPathServiceError';
  }
}
