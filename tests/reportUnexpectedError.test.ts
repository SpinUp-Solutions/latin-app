import {
  getErrorStatus,
  isClientFetchOrParseFailure,
  isExpectedApiError,
  reportServerUnexpectedError,
  reportUnexpectedError,
  shouldReportClientHardFail,
} from '@/src/lib/report-unexpected-error';
import { captureException } from '@sentry/nextjs';

describe('report-unexpected-error', () => {
  beforeEach(() => {
    (captureException as jest.Mock).mockClear();
  });

  describe('isExpectedApiError', () => {
    it.each([401, 403, 404, 400, 422])('treats HTTP %s as expected', status => {
      expect(isExpectedApiError({ status, data: { error: 'nope' } })).toBe(true);
    });

    it('treats known domain codes as expected', () => {
      expect(isExpectedApiError({ status: 403, data: { code: 'LESSON_LOCKED' } })).toBe(true);
      expect(isExpectedApiError({ code: 'TEST_NOT_AVAILABLE' })).toBe(true);
    });

    it('does not treat 500 as expected', () => {
      expect(isExpectedApiError({ status: 500, data: { error: 'boom' } })).toBe(false);
    });
  });

  describe('shouldReportClientHardFail', () => {
    it('reports FETCH_ERROR', () => {
      expect(shouldReportClientHardFail({ status: 'FETCH_ERROR', error: 'Network' })).toBe(true);
      expect(isClientFetchOrParseFailure({ status: 'FETCH_ERROR', error: 'Network' })).toBe(true);
    });

    it('skips expected 4xx and numeric 5xx', () => {
      expect(shouldReportClientHardFail({ status: 403, data: { code: 'LESSON_LOCKED' } })).toBe(false);
      expect(shouldReportClientHardFail({ status: 500, data: { error: 'Failed' } })).toBe(false);
    });

    it('reports unknown shapes', () => {
      expect(shouldReportClientHardFail(new Error('weird'))).toBe(true);
      expect(getErrorStatus(new Error('weird'))).toBeUndefined();
    });
  });

  describe('reportUnexpectedError', () => {
    it('skips expected errors', () => {
      reportUnexpectedError({ status: 401, data: { error: 'Unauthorized' } });
      expect(captureException).not.toHaveBeenCalled();
    });

    it('captures unexpected errors with tags', () => {
      const error = new Error('render failed');
      reportUnexpectedError(error, { tags: { surface: 'exercise_error_boundary', lessonId: 'lesson-1' } });
      expect(captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tags: { surface: 'exercise_error_boundary', lessonId: 'lesson-1' },
        })
      );
    });
  });

  describe('reportServerUnexpectedError', () => {
    it('always captures (caller already filtered domain errors)', () => {
      const error = new Error('db down');
      reportServerUnexpectedError(error, { tags: { surface: 'route_error_response', action: 'fetch' } });
      expect(captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tags: { surface: 'route_error_response', action: 'fetch' },
        })
      );
    });
  });
});
