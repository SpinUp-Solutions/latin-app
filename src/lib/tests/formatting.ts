const DISPLAY_PERCENTAGE_DECIMALS = 2;
const DISPLAY_PERCENTAGE_SCALE = 10 ** DISPLAY_PERCENTAGE_DECIMALS;

/**
 * Formats an assessment percentage without rounding a failing value up to a
 * passing threshold. Scores are non-negative, so flooring preserves an honest
 * student-facing representation while still hiding floating-point noise.
 */
export function formatScorePercentage(value: number): string {
  if (!Number.isFinite(value)) return '0';

  const bounded = Math.max(0, Math.min(100, value));
  const floored = Math.floor(bounded * DISPLAY_PERCENTAGE_SCALE + 1e-9) / DISPLAY_PERCENTAGE_SCALE;
  return floored
    .toFixed(DISPLAY_PERCENTAGE_DECIMALS)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}

export function formatScorePoints(value: number): string {
  if (!Number.isFinite(value)) return '0';

  return value
    .toFixed(DISPLAY_PERCENTAGE_DECIMALS)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}

export function formatScoreShortfall(value: number): string {
  if (Number.isFinite(value) && value > 0 && value < 0.01) return '<0.01';
  return formatScorePercentage(value);
}
