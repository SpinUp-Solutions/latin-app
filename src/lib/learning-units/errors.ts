export type LearningUnitServiceErrorCode = 'TEST_NOT_FOUND' | 'STALE_LEARNING_UNIT_DATA';

export class LearningUnitServiceError extends Error {
  constructor(
    public readonly code: LearningUnitServiceErrorCode,
    message: string,
    public readonly status: 404 | 409
  ) {
    super(message);
    this.name = 'LearningUnitServiceError';
  }
}
