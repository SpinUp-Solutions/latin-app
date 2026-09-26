import { ANNOTATION_SPECS } from '@/src/features/sentence-diagramming/annotation-spec';
import { getSpanText, type DiagramSpan } from '@/src/features/sentence-diagramming/model';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { formatScorePercentage, formatScorePoints } from '@/src/lib/tests/formatting';
import type { ResultPdfSource, ResultPdfStudentIdentity } from '@/src/lib/tests/result-pdf-identity';
import type { StudentSubmittedTestAttempt } from '@/src/types/test';
import type { StudentTestResult, TestResultReviewExerciseItem, TestResultReviewItem } from '@/src/types/test-results';
import { richTextToPlainText } from '@/src/utils/exercises/helpers';

export type TestResultPdfTone = 'neutral' | 'score' | 'correct' | 'partial' | 'incorrect' | 'answer' | 'student';

export interface TestResultPdfLineGroup {
  heading?: string;
  tone?: TestResultPdfTone;
  lines: string[];
  table?: {
    columns: string[];
    rows: Array<Array<{ lines: string[]; tone?: TestResultPdfTone }>>;
  };
}

/** Font-safe pairing mark. Embedded Noto Sans has no arrow glyphs (U+2192 / U+2194). */
export const RESULT_PDF_PAIR_SEPARATOR = ' — ';

export interface TestResultPdfExercise {
  number: number;
  title: string;
  awardedPoints: string;
  maxPoints: string;
  statusLabel: 'Correct' | 'Partly correct' | 'Incorrect';
  groups: TestResultPdfLineGroup[];
}

export interface TestResultPdfModel {
  kindLabel: ResultPdfSource['kindLabel'];
  title: string;
  submittedAtLabel: string;
  studentName: string;
  studentUsername: string | null;
  studentEmail: string | null;
  percentageLabel: string;
  scoreLabel: string;
  maxScoreLabel: string;
  outcomeLabel: string | null;
  passingPercentageLabel: string | null;
  reviewUnavailableNote: string | null;
  exerciseSummaries: Array<{
    number: number;
    title: string;
    awardedPoints: string;
    maxPoints: string;
    statusLabel?: TestResultPdfExercise['statusLabel'];
  }>;
  exercises: TestResultPdfExercise[];
}

type ExerciseOfType<T extends TestResultReviewExerciseItem['type']> = Extract<
  TestResultReviewExerciseItem,
  { type: T }
>;

interface ReviewEntry {
  number: number;
  exercise: TestResultReviewExerciseItem;
}

const EMPTY_ANSWER = 'No answer was recorded.';

const plain = (value?: string | null): string => (value ? richTextToPlainText(value) : '');

// Match the student's DOM textContent: decode entities once and concatenate text
// nodes without inserting whitespace at block/BR boundaries or counting comments.
const htmlTextContent = (node: DefaultTreeAdapterMap['node']): string => {
  if ('value' in node) return node.value;
  return 'childNodes' in node ? node.childNodes.map(htmlTextContent).join('') : '';
};

const wordsFromHtml = (html: string): string[] =>
  htmlTextContent(parseFragment(html))
    .split(/\s+/)
    .filter(word => word.trim());

const isExerciseReviewItem = (item: TestResultReviewItem): item is TestResultReviewExerciseItem => 'answerKey' in item;

const statusLabel = (awardedPoints: number, maxPoints: number): TestResultPdfExercise['statusLabel'] => {
  if (awardedPoints >= maxPoints) return 'Correct';
  if (awardedPoints > 0) return 'Partly correct';
  return 'Incorrect';
};

const markLabel = (
  awardedPoints: number,
  maxPoints: number,
  correct?: boolean
): TestResultPdfExercise['statusLabel'] => {
  if (correct === true) return 'Correct';
  if (correct === false) return awardedPoints > 0 ? 'Partly correct' : 'Incorrect';
  return statusLabel(awardedPoints, maxPoints);
};

const pointsLine = (awardedPoints: number, maxPoints: number, correct?: boolean): string =>
  `${markLabel(awardedPoints, maxPoints, correct)} · ${formatScorePoints(awardedPoints)} / ${formatScorePoints(maxPoints)} points`;

const statusTone = (awardedPoints: number, maxPoints: number, correct?: boolean): TestResultPdfTone => {
  const mark = markLabel(awardedPoints, maxPoints, correct);
  if (mark === 'Correct') return 'correct';
  if (mark === 'Partly correct') return 'partial';
  return 'incorrect';
};

const studentTone = (awardedPoints: number, maxPoints: number, correct?: boolean): TestResultPdfTone => {
  const mark = markLabel(awardedPoints, maxPoints, correct);
  if (mark === 'Correct') return 'student';
  if (mark === 'Partly correct') return 'partial';
  return 'incorrect';
};

const pairValues = (left: string, right: string): string => `${left}${RESULT_PDF_PAIR_SEPARATOR}${right}`;

const formatSubmittedAt = (submittedAt: string): string => {
  const parsed = new Date(submittedAt);
  if (!Number.isFinite(parsed.getTime())) return submittedAt;
  const iso = parsed.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
};

const outcomeLabelFor = (attempt: StudentSubmittedTestAttempt): string | null => {
  if (attempt.outcome === 'score-only') return 'Score only';
  if (attempt.passingPercentage === null) return null;
  return attempt.outcome === 'passed' ? 'Passed' : 'Not passed';
};

const recorded = (value?: string | null): string => {
  const trimmed = value?.trim() ?? '';
  return trimmed || EMPTY_ANSWER;
};

const multiline = (value?: string | null): string[] => {
  const trimmed = value?.replace(/\r\n/g, '\n').trim() ?? '';
  return trimmed ? trimmed.split('\n') : [EMPTY_ANSWER];
};

const group = (heading: string | undefined, lines: string[], tone?: TestResultPdfTone): TestResultPdfLineGroup => ({
  ...(heading ? { heading } : {}),
  ...(tone ? { tone } : {}),
  lines: lines.length > 0 ? lines : [EMPTY_ANSWER],
});

function buildReviewEntries(result: StudentTestResult): ReviewEntry[] {
  const entries: ReviewEntry[] = [];
  let number = 0;
  for (const page of result.review?.content.pages ?? []) {
    for (const item of page.items) {
      if (!isExerciseReviewItem(item)) continue;
      number += 1;
      entries.push({ number, exercise: item });
    }
  }
  return entries;
}

function withExerciseInstructions(
  groups: TestResultPdfLineGroup[],
  instructions?: string | null
): TestResultPdfLineGroup[] {
  const instruction = plain(instructions);
  if (!instruction) return groups;
  if (groups[0]?.heading === 'Question' || groups[0]?.heading?.startsWith('Question ')) {
    groups[0] = { ...groups[0], lines: [instruction, ...groups[0].lines] };
    return groups;
  }
  return [group('Question', [instruction]), ...groups];
}

function flattenExercise(item: TestResultReviewExerciseItem): TestResultPdfLineGroup[] {
  switch (item.type) {
    case 'matching':
      return flattenMatching(item);
    case 'fill':
      return flattenFill(item);
    case 'multiple-choice':
      return flattenMultipleChoice(item);
    case 'odd-one-out':
      return flattenOddOneOut(item);
    case 'text-selection':
      return flattenTextSelection(item);
    case 'fill-embolded-text':
      return flattenFillEmbolded(item);
    case 'sentence-diagramming':
      return flattenSentenceDiagram(item);
    case 'table-fill':
      return flattenTableFill(item);
    case 'click-on-multiple-words':
      return flattenClickOnMultipleWords(item);
    case 'generated-translation':
      return flattenGeneratedTranslation(item);
    case 'generated-form-identification':
      return flattenGeneratedFormIdentification(item);
    case 'translation-grading':
      return flattenTranslationGrading(item);
    default:
      return [group(undefined, ['This exercise type cannot be reviewed.'])];
  }
}

function flattenMatching(item: ExerciseOfType<'matching'>): TestResultPdfLineGroup[] {
  const scoredRounds = item.itemResults.rounds;
  const savedRounds = item.studentAnswer?.type === 'matching' ? item.studentAnswer.rounds : [];
  const roundCount = Math.max(scoredRounds.length, savedRounds.length);
  const groups: TestResultPdfLineGroup[] = [
    group(
      'Expected answer',
      item.answerKey.pairs.map(pair => pairValues(plain(pair.leftValue), plain(pair.rightValue))),
      'answer'
    ),
  ];

  if (roundCount === 0) {
    groups.push(group('Student answer', [EMPTY_ANSWER], studentTone(item.result.awardedPoints, item.result.maxPoints)));
    return groups;
  }

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const heading = roundCount > 1 ? `Student answer — round ${roundIndex + 1}` : 'Student answer';
    const lines = item.answerKey.pairs.map(pair => {
      const selection = scoredRounds[roundIndex]?.[pair.leftId];
      const savedRightId = savedRounds[roundIndex]?.[pair.leftId];
      const rightId = selection?.rightId || savedRightId || null;
      const rightValue = rightId
        ? (item.question.rightColumn.find(right => right.id === rightId)?.value ?? rightId)
        : null;
      const mark = selection
        ? pointsLine(selection.points.awardedPoints, selection.points.maxPoints, selection.correct)
        : rightId
          ? 'Answer recorded'
          : 'No match';
      return `${pairValues(plain(pair.leftValue), plain(rightValue) || 'No match')} (${mark})`;
    });
    const pairResults = item.answerKey.pairs.map(pair => scoredRounds[roundIndex]?.[pair.leftId]);
    const awarded = pairResults.reduce((sum, result) => sum + (result?.points.awardedPoints ?? 0), 0);
    const max = pairResults.reduce((sum, result) => sum + (result?.points.maxPoints ?? 0), 0);
    const correct = pairResults.length > 0 && pairResults.every(result => result?.correct);
    groups.push(
      group(
        heading,
        lines,
        pairResults.some(Boolean)
          ? studentTone(awarded, max || 1, correct)
          : studentTone(item.result.awardedPoints, item.result.maxPoints)
      )
    );
  }
  return groups;
}

function flattenFill(item: ExerciseOfType<'fill'>): TestResultPdfLineGroup[] {
  const saved = item.studentAnswer?.type === 'fill' ? item.studentAnswer.answers : [];
  return item.answerKey.items.flatMap((keyItem, index) => {
    const result = item.itemResults.answers[index];
    const studentValue = result?.value ?? saved[index];
    const awarded = result?.points.awardedPoints ?? 0;
    const max = result?.points.maxPoints ?? 1;
    const prompt = plain(keyItem.text) || `Blank ${index + 1}`;
    const accepted = keyItem.acceptedAnswers.join(' or ');
    const groups: TestResultPdfLineGroup[] = [];
    if (item.answerKey.items.length > 1) {
      groups.push(
        group(
          `Blank ${index + 1}`,
          [result ? pointsLine(awarded, max, result.correct) : 'Not scored'],
          result ? statusTone(awarded, max, result.correct) : 'score'
        )
      );
    }
    groups.push(
      group('Question', [prompt]),
      group('Expected answer', [accepted], 'answer'),
      group(
        'Student answer',
        [recorded(studentValue)],
        result ? studentTone(awarded, max, result.correct) : 'incorrect'
      )
    );
    return groups;
  });
}

function flattenMultipleChoice(item: ExerciseOfType<'multiple-choice'>): TestResultPdfLineGroup[] {
  const selectedIds = new Set(
    item.itemResults.selectedOptionIds.length > 0
      ? item.itemResults.selectedOptionIds
      : item.studentAnswer?.type === 'multiple-choice'
        ? item.studentAnswer.selectedOptionIds
        : []
  );
  const selected = item.answerKey.options.filter(option => selectedIds.has(option.id));
  const correct = item.answerKey.options.filter(option => option.isCorrect);
  const awarded = item.itemResults.points.awardedPoints;
  const max = item.itemResults.points.maxPoints;
  return [
    group('Question', [plain(item.question.question)]),
    group(
      correct.length > 1 ? 'Expected answers' : 'Expected answer',
      correct.map(option => plain(option.text)),
      'answer'
    ),
    group(
      'Student answer',
      selected.length > 0 ? selected.map(option => plain(option.text)) : [EMPTY_ANSWER],
      studentTone(awarded, max, item.itemResults.correct)
    ),
  ];
}

function flattenOddOneOut(item: ExerciseOfType<'odd-one-out'>): TestResultPdfLineGroup[] {
  const selectedId =
    item.itemResults.selectedItemId ||
    (item.studentAnswer?.type === 'odd-one-out' ? item.studentAnswer.selectedItemId : '');
  const selected = item.answerKey.items.find(entry => entry.id === selectedId);
  const oddOne = item.answerKey.items.find(entry => entry.isOddOneOut);
  const savedExplanation =
    item.itemResults.explanation || (item.studentAnswer?.type === 'odd-one-out' ? item.studentAnswer.explanation : '');
  const awarded = item.itemResults.points.awardedPoints;
  const max = item.itemResults.points.maxPoints;
  const tone = studentTone(awarded, max, item.itemResults.correct);
  const studentLines = [recorded(selected ? plain(selected.text) : '')];
  if (item.question.requireExplanation) studentLines.push(...multiline(savedExplanation));
  return [
    group('Question', [plain(item.question.question)]),
    group('Expected answer', [recorded(oddOne ? plain(oddOne.text) : '')], 'answer'),
    group('Student answer', studentLines, tone),
  ];
}

function flattenTextSelection(item: ExerciseOfType<'text-selection'>): TestResultPdfLineGroup[] {
  const words = wordsFromHtml(item.question.passage);
  const savedIndices = item.studentAnswer?.type === 'text-selection' ? item.studentAnswer.selectedWordIndices : [];
  const groups: TestResultPdfLineGroup[] = [group('Question', [plain(item.question.passage)])];
  item.answerKey.questions.forEach((question, index) => {
    const result = item.itemResults.selections[index];
    const wordIndex = result && result.wordIndex >= 0 ? result.wordIndex : (savedIndices[index] ?? -1);
    const selectedWord = wordIndex >= 0 ? (words[wordIndex] ?? `word ${wordIndex + 1}`) : '';
    const correctWord = words[question.correctWordIndex] ?? `word ${question.correctWordIndex + 1}`;
    const awarded = result?.points.awardedPoints ?? 0;
    const max = result?.points.maxPoints ?? 1;
    groups.push(
      group(
        `Question ${index + 1}`,
        [result ? pointsLine(awarded, max, result.correct) : 'Not scored'],
        result ? statusTone(awarded, max, result.correct) : 'score'
      ),
      group('Question', [plain(question.text)]),
      group('Expected answer', [correctWord], 'answer'),
      group(
        'Student answer',
        [recorded(selectedWord)],
        result ? studentTone(awarded, max, result.correct) : 'incorrect'
      )
    );
  });
  return groups;
}

function flattenFillEmbolded(item: ExerciseOfType<'fill-embolded-text'>): TestResultPdfLineGroup[] {
  const saved = item.studentAnswer?.type === 'fill-embolded-text' ? item.studentAnswer.answers : [];
  const groups: TestResultPdfLineGroup[] = [group('Question', [plain(item.question.passage)])];
  item.answerKey.words.forEach((word, index) => {
    const result = item.itemResults.answers[index];
    const studentValue = result?.value ?? saved[index];
    const awarded = result?.points.awardedPoints ?? 0;
    const max = result?.points.maxPoints ?? 1;
    const heading = word.question ? `Question ${index + 1}` : `Word ${index + 1}`;
    groups.push(
      group(
        heading,
        [result ? pointsLine(awarded, max, result.correct) : 'Not scored'],
        result ? statusTone(awarded, max, result.correct) : 'score'
      )
    );
    if (plain(word.question)) groups.push(group('Question', [plain(word.question)]));
    groups.push(
      group('Expected answer', [word.correctAnswer], 'answer'),
      group(
        'Student answer',
        [recorded(studentValue)],
        result ? studentTone(awarded, max, result.correct) : 'incorrect'
      )
    );
  });
  return groups;
}

function flattenSentenceDiagram(item: ExerciseOfType<'sentence-diagramming'>): TestResultPdfLineGroup[] {
  const formatAnnotation = (annotation: { kind: string; span: DiagramSpan }) => {
    const label =
      annotation.kind in ANNOTATION_SPECS
        ? ANNOTATION_SPECS[annotation.kind as keyof typeof ANNOTATION_SPECS].label
        : annotation.kind;
    return `${label}: ${getSpanText(item.answerKey.tokens, annotation.span).trim() || '(empty span)'}`;
  };
  const studentAnnotations =
    item.itemResults.annotations.length > 0
      ? item.itemResults.annotations
      : item.studentAnswer?.type === 'sentence-diagramming'
        ? item.studentAnswer.annotations
        : [];
  const awarded = item.itemResults.points.awardedPoints;
  const max = item.itemResults.points.maxPoints;
  return [
    group('Question', [
      plain(item.answerKey.latin),
      ...(item.answerKey.translation ? [`“${plain(item.answerKey.translation)}”`] : []),
      `${item.itemResults.accuracy}% of annotations matched.`,
    ]),
    group(
      'Expected answer',
      item.answerKey.solutionAnnotations.length > 0
        ? item.answerKey.solutionAnnotations.map(formatAnnotation)
        : ['No solution annotations were recorded.'],
      'answer'
    ),
    group(
      'Student answer',
      studentAnnotations.length > 0 ? studentAnnotations.map(formatAnnotation) : [EMPTY_ANSWER],
      studentTone(awarded, max, item.itemResults.correct)
    ),
  ];
}

function flattenTableFill(item: ExerciseOfType<'table-fill'>): TestResultPdfLineGroup[] {
  const resultsByCell = new Map(item.itemResults.cells.map(cell => [`${cell.rowId}-${cell.columnId}`, cell]));
  const saved = item.studentAnswer?.type === 'table-fill' ? item.studentAnswer.answers : {};
  const groups: TestResultPdfLineGroup[] = [];
  const title = plain(item.question.title);
  if (title) groups.push(group('Question', [title]));
  groups.push({
    lines: [],
    table: {
      columns: item.question.columns.map((column, index) => plain(column.header) || `Column ${index + 1}`),
      rows: item.answerKey.rows.map(row =>
        item.question.columns.map(column => {
          const cell = row.cells[column.id];
          if (!cell?.isBlank) return { lines: [plain(cell?.content)] };
          const key = `${row.id}-${column.id}`;
          const result = resultsByCell.get(key);
          return {
            lines: [
              recorded(result?.value ?? saved[key]),
              `Expected: ${recorded(cell.answer)}`,
              result ? pointsLine(result.points.awardedPoints, result.points.maxPoints, result.correct) : 'Not scored',
            ],
            tone: result
              ? studentTone(result.points.awardedPoints, result.points.maxPoints, result.correct)
              : 'neutral',
          };
        })
      ),
    },
  });
  return groups;
}

function flattenClickOnMultipleWords(item: ExerciseOfType<'click-on-multiple-words'>): TestResultPdfLineGroup[] {
  const words = wordsFromHtml(item.question.passage);
  const selectedIndices =
    item.itemResults.selectedWordIndices.length > 0
      ? item.itemResults.selectedWordIndices
      : item.studentAnswer?.type === 'click-on-multiple-words'
        ? item.studentAnswer.selectedWordIndices
        : [];
  const wordAt = (index: number) => words[index] ?? `word ${index + 1}`;
  const awarded = item.itemResults.points.awardedPoints;
  const max = item.itemResults.points.maxPoints;
  const groups: TestResultPdfLineGroup[] = [];
  const promptLines = [
    ...(plain(item.question.title) ? [plain(item.question.title)] : []),
    ...(plain(item.question.instructions) ? [plain(item.question.instructions)] : []),
    plain(item.question.passage),
  ].filter(Boolean);
  if (promptLines.length > 0) groups.push(group('Question', promptLines));
  groups.push(
    group(
      'Expected answer',
      item.answerKey.correctWordIndices.length > 0
        ? item.answerKey.correctWordIndices.map(index => wordAt(index))
        : ['No correct words were recorded.'],
      'answer'
    )
  );
  groups.push(
    group(
      'Student answer',
      selectedIndices.length > 0 ? selectedIndices.map(index => wordAt(index)) : [EMPTY_ANSWER],
      studentTone(awarded, max, item.itemResults.correct)
    )
  );
  return groups;
}

function flattenGeneratedTranslation(item: ExerciseOfType<'generated-translation'>): TestResultPdfLineGroup[] {
  const saved = item.studentAnswer?.type === 'generated-translation' ? item.studentAnswer.answers : [];
  return item.answerKey.items.flatMap((keyItem, index) => {
    const result = item.itemResults.answers[index];
    const studentValue = result?.value ?? saved[index];
    const awarded = result?.points.awardedPoints ?? 0;
    const max = result?.points.maxPoints ?? 1;
    const accepted = keyItem.acceptedAnswers.join(' or ');
    return [
      group(
        `Item ${index + 1}`,
        [result ? pointsLine(awarded, max, result.correct) : 'Not scored'],
        result ? statusTone(awarded, max, result.correct) : 'score'
      ),
      group('Question', [plain(keyItem.text)]),
      group('Expected answer', [accepted], 'answer'),
      group(
        'Student answer',
        [recorded(studentValue)],
        result ? studentTone(awarded, max, result.correct) : 'incorrect'
      ),
    ];
  });
}

function flattenGeneratedFormIdentification(
  item: ExerciseOfType<'generated-form-identification'>
): TestResultPdfLineGroup[] {
  const saved = item.studentAnswer?.type === 'generated-form-identification' ? item.studentAnswer.answers : {};
  return item.answerKey.items.flatMap((keyItem, index) => {
    const result = item.itemResults.answers[index];
    const studentValue = result?.value ?? saved[keyItem.id];
    const stepLabel = 'step' in keyItem ? keyItem.step : keyItem.steps.join(' · ');
    const accepted = 'acceptedAnswers' in keyItem ? keyItem.acceptedAnswers : null;
    const correctDisplay = 'correctAnswerDisplay' in keyItem ? keyItem.correctAnswerDisplay : '';
    const correctAnswer = 'correctAnswer' in keyItem ? keyItem.correctAnswer : '';
    const awarded = result?.points.awardedPoints ?? 0;
    const max = result?.points.maxPoints ?? 1;
    const expected: string[] = [];
    if (accepted?.length) expected.push(accepted.join(' or '));
    if (correctAnswer && !accepted?.includes(correctAnswer)) expected.push(correctAnswer);
    if (correctDisplay && !accepted?.length) expected.push(correctDisplay);
    return [
      group(
        `${keyItem.word} — ${stepLabel}`,
        [
          ...(keyItem.selected_form ? [`Selected form: ${keyItem.selected_form}`] : []),
          result ? pointsLine(awarded, max, result.correct) : 'Not scored',
        ],
        result ? statusTone(awarded, max, result.correct) : 'score'
      ),
      group('Expected answer', expected.length > 0 ? expected : ['No accepted answer was recorded.'], 'answer'),
      group(
        'Student answer',
        [recorded(studentValue)],
        result ? studentTone(awarded, max, result.correct) : 'incorrect'
      ),
    ];
  });
}

function flattenTranslationGrading(item: ExerciseOfType<'translation-grading'>): TestResultPdfLineGroup[] {
  const saved = item.studentAnswer?.type === 'translation-grading' ? item.studentAnswer.translations : [];
  const count = Math.max(item.itemResults.items.length, item.answerKey.items.length, saved.length);
  const groups: TestResultPdfLineGroup[] = [];
  for (let index = 0; index < count; index += 1) {
    const result = item.itemResults.items[index];
    const latin = plain(item.answerKey.items[index]?.latinText ?? item.question.items[index]?.latinText);
    const instructions = plain(item.answerKey.items[index]?.instructions ?? item.question.items[index]?.instructions);
    const awarded = result?.points.awardedPoints ?? 0;
    const max = result?.points.maxPoints ?? 1;
    const aiScore = result == null || result.score === null ? 'Not graded' : `${result.score} / 10`;
    if (count > 1) {
      groups.push(
        group(
          `Score ${index + 1}`,
          [`AI score: ${aiScore}`, result ? pointsLine(awarded, max) : 'Not scored'],
          result ? statusTone(awarded, max) : 'score'
        )
      );
    } else {
      groups.push(group('AI score', [aiScore]));
    }
    const questionLines = [latin, instructions].filter(Boolean);
    if (questionLines.length) groups.push(group(count > 1 ? `Question ${index + 1}` : 'Question', questionLines));
    groups.push(
      group(
        'Student answer',
        multiline(result?.translation ?? saved[index]),
        result ? studentTone(awarded, max) : 'incorrect'
      )
    );
  }
  return groups;
}

function summariesFromAttempt(attempt: StudentSubmittedTestAttempt): TestResultPdfModel['exerciseSummaries'] {
  return Object.values(attempt.exerciseResults).map((exercise, index) => ({
    number: index + 1,
    title: plain(exercise.title) || `Exercise ${index + 1}`,
    awardedPoints: formatScorePoints(exercise.awardedPoints),
    maxPoints: formatScorePoints(exercise.maxPoints),
    statusLabel: statusLabel(exercise.awardedPoints, exercise.maxPoints),
  }));
}

export function buildTestResultPdfModel(input: {
  result: StudentTestResult;
  identity: ResultPdfStudentIdentity;
  source: ResultPdfSource;
}): TestResultPdfModel {
  const { result, identity, source } = input;
  const entries = buildReviewEntries(result);
  const exercises: TestResultPdfExercise[] = entries.map(entry => ({
    number: entry.number,
    title: plain(entry.exercise.title) || `Exercise ${entry.number}`,
    awardedPoints: formatScorePoints(entry.exercise.result.awardedPoints),
    maxPoints: formatScorePoints(entry.exercise.result.maxPoints),
    statusLabel: statusLabel(entry.exercise.result.awardedPoints, entry.exercise.result.maxPoints),
    groups: withExerciseInstructions(flattenExercise(entry.exercise), entry.exercise.instructions),
  }));

  const exerciseSummaries =
    exercises.length > 0
      ? exercises.map(exercise => ({
          number: exercise.number,
          title: exercise.title,
          awardedPoints: exercise.awardedPoints,
          maxPoints: exercise.maxPoints,
          statusLabel: exercise.statusLabel,
        }))
      : summariesFromAttempt(result.attempt);

  return {
    kindLabel: source.kindLabel,
    title: source.title,
    submittedAtLabel: formatSubmittedAt(result.attempt.submittedAt),
    studentName: identity.name,
    studentUsername: identity.username,
    studentEmail: identity.email,
    percentageLabel: `${formatScorePercentage(result.attempt.percentage)}%`,
    scoreLabel: formatScorePoints(result.attempt.score),
    maxScoreLabel: formatScorePoints(result.attempt.maxScore),
    outcomeLabel: outcomeLabelFor(result.attempt),
    passingPercentageLabel: result.attempt.passingPercentage === null ? null : `${result.attempt.passingPercentage}%`,
    reviewUnavailableNote:
      result.review === null
        ? 'The frozen score summary is included, but the question-by-question review could not be loaded for this attempt.'
        : exercises.length === 0
          ? 'This attempt does not contain any reviewable exercises.'
          : null,
    exerciseSummaries,
    exercises,
  };
}
