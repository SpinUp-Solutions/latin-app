import { formatScorePercentage, formatScorePoints, formatScoreShortfall } from '@/src/lib/tests/formatting';

describe('assessment percentage formatting', () => {
  it('does not round a failing percentage up to the next whole number', () => {
    expect(formatScorePercentage(79.999)).toBe('79.99');
    expect(formatScorePercentage(79.6)).toBe('79.6');
  });

  it('keeps whole percentages compact and removes floating-point noise', () => {
    expect(formatScorePercentage(80)).toBe('80');
    expect(formatScorePercentage(66.6666666667)).toBe('66.66');
    expect(formatScorePercentage(100.0000000001)).toBe('100');
  });

  it('keeps a positive near-threshold deficit visible', () => {
    expect(formatScoreShortfall(0.001)).toBe('<0.01');
    expect(formatScoreShortfall(0.4)).toBe('0.4');
  });

  it('formats point totals compactly without percentage clamping', () => {
    expect(formatScorePoints(8)).toBe('8');
    expect(formatScorePoints(8.125)).toBe('8.13');
    expect(formatScorePoints(125)).toBe('125');
  });
});
