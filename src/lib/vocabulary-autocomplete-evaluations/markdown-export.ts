import {
  VOCABULARY_AUTOCOMPLETE_PROFILES,
  type VocabularyAutocompleteProfileId,
} from '../../../shared/openai/model-registry';
import { compareEntryForms, PROSE_FIELDS, summarizeVocabularyRun, type FormAgreement } from './comparison';
import type {
  VocabularyEvaluationCaseInput,
  VocabularyEvaluationCell,
  VocabularyEvaluationRunResult,
} from './contracts';

type ProfilePair = readonly [VocabularyAutocompleteProfileId, VocabularyAutocompleteProfileId];

const AGREEMENT_WORDS: Record<Exclude<FormAgreement, 'same'>, string> = {
  different: 'different',
  macrons: 'macrons or capitals only',
  missing: 'only one model filled it',
};
const DIFFERENCE_ORDER: FormAgreement[] = ['different', 'missing', 'macrons'];

/** Keeps a value on one table row: pipes would split the cell and newlines end the row. */
const cell = (text: string) =>
  text
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ')
    .trim() || '—';
const row = (cells: string[]) => `| ${cells.map(cell).join(' | ')} |`;
const table = (header: string[], rows: string[][]) =>
  [row(header), `|${header.map(() => ' --- ').join('|')}|`, ...rows.map(row)].join('\n');

const count = (value: number) => new Intl.NumberFormat('en-US').format(Math.round(value));
const seconds = (milliseconds: number) => `${(milliseconds / 1_000).toFixed(1)} s`;
const dollars = (value: number) => `$${value.toFixed(5)}`;
const percent = (share: number) => `${Math.round(share * 100)}%`;
const label = (profileId: VocabularyAutocompleteProfileId) => VOCABULARY_AUTOCOMPLETE_PROFILES[profileId].label;
const proseText = (value: unknown) =>
  Array.isArray(value) ? value.filter(Boolean).join('; ') : typeof value === 'string' ? value : '';

function cellStatus(item: VocabularyEvaluationCell) {
  if (item.output) return item.appCacheHit ? 'completed (cached result)' : 'completed';
  const reason = item.incompleteReason ? ` (${item.incompleteReason})` : '';
  return `failed: ${item.errorCode ?? 'error'}${reason}${item.error ? ` — ${item.error}` : ''}`;
}

function entrySection(index: number, pair: [VocabularyEvaluationCell, VocabularyEvaluationCell]) {
  const [first, second] = pair;
  const lines = [`## ${index + 1}. ${first.word} (${first.partOfSpeech})`, ''];

  lines.push(
    table(
      ['Model', 'Status', 'Time', 'Cost', 'Input tokens', 'Output tokens', 'Reasoning tokens', 'Output cap used'],
      pair.map(item => [
        label(item.profileId),
        cellStatus(item),
        seconds(item.generationLatencyMs),
        item.cost ? dollars(item.cost.totalCost) : '—',
        item.usage ? count(item.usage.promptTokens) : '—',
        item.usage ? count(item.usage.completionTokens) : '—',
        item.usage ? count(item.usage.reasoningTokens ?? 0) : '—',
        item.usage
          ? `${percent(item.usage.completionTokens / item.maxOutputTokens)} of ${count(item.maxOutputTokens)}`
          : '—',
      ])
    ),
    ''
  );

  if (!first.output || !second.output) {
    const failed = pair.filter(item => !item.output).map(item => label(item.profileId));
    lines.push(`Forms not compared: ${failed.join(' and ')} returned no entry.`, '');
    return lines;
  }

  const prose = PROSE_FIELDS.filter(field => field in first.output! || field in second.output!);
  if (prose.length > 0) {
    lines.push(
      '### Prose (not scored)',
      '',
      table(
        ['Field', label(first.profileId), label(second.profileId)],
        prose.map(field => [field, proseText(first.output![field]), proseText(second.output![field])])
      ),
      ''
    );
  }

  const { rows, counts } = compareEntryForms(first.output, second.output);
  if (counts.total === 0) {
    lines.push('No inflected forms to compare.', '');
    return lines;
  }
  const differing = rows
    .filter(item => item.agreement !== 'same')
    .sort((a, b) => DIFFERENCE_ORDER.indexOf(a.agreement) - DIFFERENCE_ORDER.indexOf(b.agreement));
  if (differing.length === 0) {
    lines.push(`All ${counts.total} forms match exactly.`, '');
    return lines;
  }
  lines.push(
    `### Forms that differ (${differing.length} of ${counts.total}; ${counts.same} match exactly)`,
    '',
    table(
      ['Form', label(first.profileId), label(second.profileId), 'Difference'],
      differing.map(item => [
        item.key,
        item.values[0].join(' / '),
        item.values[1].join(' / '),
        AGREEMENT_WORDS[item.agreement as Exclude<FormAgreement, 'same'>],
      ])
    ),
    ''
  );
  return lines;
}

/**
 * Writes a run as Markdown for pasting into a chat with an agent: the models,
 * the run's figures, and per word the prose side by side and only the forms
 * that differ, so the report stays short enough to read in one go.
 */
export function vocabularyRunToMarkdown(
  result: VocabularyEvaluationRunResult,
  evaluationCase: VocabularyEvaluationCaseInput,
  profileIds: ProfilePair
) {
  const summary = summarizeVocabularyRun(result.cells, profileIds);
  const pairs = evaluationCase.entries.flatMap(entry => {
    const pair = profileIds.map(id => result.cells.find(item => item.entryId === entry.id && item.profileId === id));
    return pair[0] && pair[1] ? [[pair[0], pair[1]] as [VocabularyEvaluationCell, VocabularyEvaluationCell]] : [];
  });
  const modelOf = (profileId: VocabularyAutocompleteProfileId) =>
    result.cells.find(item => item.profileId === profileId);

  const lines = [
    `# Vocab autocomplete evaluation: ${evaluationCase.title}`,
    '',
    `Run completed ${result.completedAt} in ${seconds(result.wallTimeMs)}${result.forceRefresh ? ', cache skipped' : ''}. ` +
      'Each word was autocompleted once by each model with the same prompt and output schema.',
    '',
    table(
      ['Model', 'Model ID', 'Reasoning effort', 'Output token cap'],
      profileIds.map(profileId => {
        const sample = modelOf(profileId);
        return [
          label(profileId),
          sample?.actualModel ?? sample?.requestedModel ?? '—',
          sample?.reasoningEffort ?? '—',
          sample ? count(sample.maxOutputTokens) : '—',
        ];
      })
    ),
    '',
    '## Summary',
    '',
    table(
      ['Figure', ...profileIds.map(label)],
      [
        ['Completed', ...summary.figures.map(item => `${item.completed} of ${item.completed + item.failed}`)],
        ['Ran out of output tokens', ...summary.figures.map(item => String(item.tokenBudgetFailures))],
        ['Average time', ...summary.figures.map(item => seconds(item.averageMs))],
        ['Average cost', ...summary.figures.map(item => dollars(item.averageCost))],
        ['Average output tokens', ...summary.figures.map(item => count(item.averageOutputTokens))],
        [
          'Most of the output cap one word used',
          ...summary.figures.map(
            item => `${percent(item.peakOutputShare)}${item.peakOutputWord ? ` (${item.peakOutputWord})` : ''}`
          ),
        ],
      ]
    ),
    '',
    `Averages cover the ${summary.comparedCount} of ${summary.entryCount} words both models completed. ` +
      `Forms across those words: ${summary.forms.same} match, ${summary.forms.macrons} differ only in macrons or capitals, ` +
      `${summary.forms.different} differ, ${summary.forms.missing} filled by one model only. ` +
      'Forms are listed by their path in the output schema.',
    '',
    ...pairs.flatMap((pair, index) => entrySection(index, pair)),
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}
