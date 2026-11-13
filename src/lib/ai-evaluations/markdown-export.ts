import { TRANSLATION_GRADING_PROFILES, type TranslationGradingProfileId } from '../../../shared/openai/model-registry';
import type { TranslationGradingMode } from '../../../shared/openai/types';
import { markdownTable as table } from '../markdown/table';
import { compareProfiles, gradeAgreement, type GradeAgreement } from './comparison';
import type { EvaluationCaseInput, EvaluationCellResult, EvaluationRunResult } from './contracts';

type ProfilePair = readonly [TranslationGradingProfileId, TranslationGradingProfileId];

const MODE_TITLES: Record<TranslationGradingMode, string> = {
  lesson: 'Lesson feedback',
  test: 'Test scoring (0–10)',
};
const AGREEMENT_WORDS: Record<GradeAgreement, string> = {
  same: 'same grade',
  close: 'close (one step or point apart)',
  different: 'different (more than one step or point apart)',
};

const count = (value: number) => new Intl.NumberFormat('en-US').format(Math.round(value));
const seconds = (milliseconds: number) => `${(milliseconds / 1_000).toFixed(1)} s`;
const dollars = (value: number) => `$${value.toFixed(6)}`;
const label = (profileId: TranslationGradingProfileId) => TRANSLATION_GRADING_PROFILES[profileId].label;
const quote = (text: string) =>
  text
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n');

function grade(item: EvaluationCellResult) {
  if (!item.output) return 'failed';
  if (item.gradingMode === 'test') return `${item.output!.score}/10`;
  return `${item.output!.feedbackLevel}${item.output!.isPassing ? ' (passing)' : ' (not passing)'}`;
}

function cellStatus(item: EvaluationCellResult) {
  if (item.output) return item.appCacheHit ? 'completed (cached result)' : 'completed';
  return `failed: ${item.errorCode ?? 'error'}${item.error ? ` — ${item.error}` : ''}`;
}

function modelDetails(item: EvaluationCellResult) {
  const lines = [`#### ${label(item.profileId)}: ${grade(item)}`, ''];
  if (!item.output) return lines;
  if (item.gradingMode === 'test') {
    lines.push(`Feedback: ${item.output!.feedback}`, '');
    return lines;
  }
  const output = item.output!;
  lines.push(`Notes: ${output.notes || '—'}`, '', `Suggested text: ${output.suggestedText || '—'}`, '');
  if (output.breakdown.length > 0) {
    lines.push(
      table(
        ['Latin segment', 'Student translation', 'Type', 'Feedback'],
        output.breakdown.map(part => [part.latinSegment, part.yourTranslation, part.type, part.feedback])
      ),
      ''
    );
  }
  if (output.grammaticalBreakdown.length > 0) {
    lines.push(
      'Grammatical breakdown:',
      '',
      table(
        ['Latin segment', 'Syntactical role', 'Key grammatical features', 'Notes'],
        output.grammaticalBreakdown.map(part => [
          part.latinSegment,
          part.syntacticalRole,
          part.keyGrammaticalFeatures,
          part.notes,
        ])
      ),
      ''
    );
  }
  return lines;
}

function modeSection(
  mode: TranslationGradingMode,
  evaluationCase: EvaluationCaseInput,
  cells: EvaluationCellResult[],
  profileIds: ProfilePair
) {
  const comparison = compareProfiles(cells, profileIds);
  const lines = [
    `## ${MODE_TITLES[mode]}`,
    '',
    `Grades agree on ${comparison.agreement.same} of ${comparison.comparedCount} answers both models graded ` +
      `(${comparison.agreement.close} close, ${comparison.agreement.different} different).`,
    '',
    table(
      ['Figure', ...profileIds.map(label)],
      [
        ['Average time', ...comparison.figures.map(item => seconds(item.averageMs))],
        ['Average cost', ...comparison.figures.map(item => dollars(item.averageCost))],
      ]
    ),
    '',
  ];

  evaluationCase.answers.forEach((answer, index) => {
    const pair = profileIds.map(id => cells.find(item => item.answerId === answer.id && item.profileId === id));
    const agreement = pair[0] && pair[1] ? gradeAgreement(pair[0], pair[1]) : null;
    lines.push(
      `### ${index + 1}. ${answer.label}${agreement ? `: ${AGREEMENT_WORDS[agreement]}` : ''}`,
      '',
      quote(answer.text),
      '',
      table(
        ['Model', 'Grade', 'Status', 'Time', 'Cost', 'Input tokens', 'Output tokens', 'Reasoning tokens'],
        pair.flatMap(item =>
          item
            ? [
                [
                  label(item.profileId),
                  grade(item),
                  cellStatus(item),
                  seconds(item.generationLatencyMs ?? item.latencyMs),
                  item.originalCost && item.originalCostStatus !== 'unavailable'
                    ? dollars(item.originalCost.totalCost)
                    : '—',
                  item.usage ? count(item.usage.promptTokens) : '—',
                  item.usage ? count(item.usage.completionTokens) : '—',
                  item.usage ? count(item.usage.reasoningTokens ?? 0) : '—',
                ],
              ]
            : []
        )
      ),
      '',
      ...pair.flatMap(item => (item ? modelDetails(item) : []))
    );
  });
  return lines;
}

/**
 * Writes an AI evaluation run as Markdown for pasting into a chat with an
 * agent: the source text, the models, and for every grading mode and answer
 * each model's grade, figures and full feedback.
 */
export function evaluationRunToMarkdown(
  result: EvaluationRunResult,
  evaluationCase: EvaluationCaseInput,
  profileIds: ProfilePair
) {
  const direction = evaluationCase.direction === 'latin-to-english' ? 'Latin → English' : 'English → Latin';
  const sample = (profileId: TranslationGradingProfileId) => result.cells.find(item => item.profileId === profileId);
  const lines = [
    `# AI evaluation: ${evaluationCase.title}`,
    '',
    `Run completed ${result.completedAt} in ${seconds(result.aggregate.wallTimeMs)}` +
      `${result.forceRefresh ? ', cache skipped' : ''}. ` +
      `${result.aggregate.evaluatedCellCount} of ${result.aggregate.cellCount} gradings completed. ` +
      `Each student answer was graded by both models with the same prompt.`,
    '',
    `Translation direction: ${direction}`,
    '',
    'Source text:',
    '',
    quote(evaluationCase.sourceText),
    '',
    table(
      ['Model', 'Model ID', 'Reasoning effort'],
      profileIds.map(profileId => {
        const item = sample(profileId);
        return [label(profileId), item?.actualModel ?? item?.requestedModel ?? '—', item?.reasoningEffort ?? '—'];
      })
    ),
    '',
    ...evaluationCase.modes.flatMap(mode =>
      modeSection(
        mode,
        evaluationCase,
        result.cells.filter(item => item.gradingMode === mode),
        profileIds
      )
    ),
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}
