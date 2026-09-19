import { ANNOTATION_SPECS } from '@/src/features/sentence-diagramming/annotation-spec';
import { formatScorePercentage, formatScorePoints } from '@/src/lib/tests/formatting';
import type { ResultPdfSource, ResultPdfStudentIdentity } from '@/src/lib/tests/result-pdf-identity';
import type { StudentSubmittedTestAttempt } from '@/src/types/test';
import type {
  StudentTestResult,
  TestResultReviewExerciseItem,
  TestResultReviewItem,
  TestResultReviewSupportingItem,
} from '@/src/types/test-results';
import { richTextToPlainText } from '@/src/utils/exercises/helpers';

export interface TestResultPdfLineGroup {
  heading?: string;
  lines: string[];
}

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
  }>;
  exercises: TestResultPdfExercise[];
}

type ExerciseOfType<T extends TestResultReviewExerciseItem['type']> = Extract<
  TestResultReviewExerciseItem,
  { type: T }
>;

interface ReviewEntry {
  number: number;
  supporting: TestResultReviewSupportingItem[];
  pageTitles: string[];
  pageHasAudio: boolean;
  poolName?: string;
  exercise: TestResultReviewExerciseItem;
}

const EMPTY_ANSWER = 'No answer was recorded.';

const plain = (value?: string | null): string => (value ? richTextToPlainText(value) : '');

const wordsFromHtml = (html: string): string[] => plain(html).split(/\s+/).filter(Boolean);

const isExerciseReviewItem = (item: TestResultReviewItem): item is TestResultReviewExerciseItem => 'answerKey' in item;

const statusLabel = (awardedPoints: number, maxPoints: number): TestResultPdfExercise['statusLabel'] => {
  if (awardedPoints >= maxPoints) return 'Correct';
  if (awardedPoints > 0) return 'Partly correct';
  return 'Incorrect';
};

const pointsLine = (awardedPoints: number, maxPoints: number, correct?: boolean): string => {
  const mark =
    correct === undefined
      ? statusLabel(awardedPoints, maxPoints)
      : correct
        ? 'Correct'
        : awardedPoints > 0
          ? 'Partly correct'
          : 'Incorrect';
  return `${mark} · ${formatScorePoints(awardedPoints)} / ${formatScorePoints(maxPoints)} points`;
};

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

const audioNote = (audioPath?: string | null): string[] => (audioPath ? ['Audio attached'] : []);

const formatTableRow = (cells: string[]): string => cells.filter(Boolean).join(' · ');

function flattenSupporting(
  items: TestResultReviewSupportingItem[],
  poolName?: string,
  poolItems?: Array<{ latin: string; english: string }>
): string[] {
  const lines: string[] = [];
  for (const item of items) {
    lines.push(...audioNote(item.audioPath));
    switch (item.type) {
      case 'text':
      case 'emphasis': {
        const title = plain(item.title);
        const content = plain(item.content);
        if (title) lines.push(title);
        if (content) lines.push(content);
        break;
      }
      case 'table': {
        const title = plain(item.tableData.title);
        const caption = plain(item.tableData.caption);
        if (title) lines.push(title);
        if (caption) lines.push(caption);
        const headers = item.tableData.columns.map(column => plain(column.header));
        if (headers.some(Boolean)) lines.push(formatTableRow(headers));
        for (const row of item.tableData.rows) {
          lines.push(
            formatTableRow([plain(row.rowHeader), ...item.tableData.columns.map(column => plain(row.cells[column.id]))])
          );
        }
        for (const footnote of item.tableData.footnotes ?? []) {
          const text = plain(footnote);
          if (text) lines.push(text);
        }
        break;
      }
      case 'vocabulary': {
        const title = plain(item.title);
        if (title) lines.push(title);
        for (const word of item.vocabularyItems) {
          lines.push(`${word.latin} — ${word.english}`);
        }
        break;
      }
      case 'vocabulary-pool': {
        lines.push(poolName ? `Vocabulary pool: ${poolName}` : 'Vocabulary pool');
        for (const word of poolItems ?? []) {
          lines.push(`${word.latin} — ${word.english}`);
        }
        break;
      }
      case 'listening-passage': {
        const title = plain(item.title);
        const instructions = plain(item.instructions);
        if (title) lines.push(title);
        if (instructions) lines.push(instructions);
        const latin = plain(item.data.latinText);
        const translation = plain(item.data.translation);
        if (latin) lines.push(latin);
        if (translation) lines.push(translation);
        lines.push(...audioNote(item.data.passageAudioPath));
        break;
      }
      default:
        break;
    }
  }
  return lines.filter(Boolean);
}

function buildReviewEntries(result: StudentTestResult): ReviewEntry[] {
  const entries: ReviewEntry[] = [];
  let number = 0;
  let pendingSupporting: TestResultReviewSupportingItem[] = [];
  let pendingPageTitles: string[] = [];
  let pendingPageAudio = false;
  const pool = result.review?.content.vocabularyPool;
  for (const page of result.review?.content.pages ?? []) {
    const title = plain(page.title);
    if (title) pendingPageTitles.push(title);
    if (page.audioPath) pendingPageAudio = true;
    let lastExerciseIndex: number | null = null;
    for (const item of page.items) {
      if (!isExerciseReviewItem(item)) {
        pendingSupporting.push(item);
        continue;
      }
      number += 1;
      lastExerciseIndex = entries.length;
      entries.push({
        number,
        supporting: pendingSupporting,
        pageTitles: pendingPageTitles,
        pageHasAudio: pendingPageAudio,
        poolName: pool?.name,
        exercise: item,
      });
      pendingSupporting = [];
      pendingPageTitles = [];
      pendingPageAudio = false;
    }
    if (pendingSupporting.length > 0 && lastExerciseIndex !== null) {
      entries[lastExerciseIndex].supporting.push(...pendingSupporting);
      pendingSupporting = [];
    }
  }
  if (entries.length > 0) {
    if (pendingPageTitles.length > 0) entries[entries.length - 1].pageTitles.push(...pendingPageTitles);
    if (pendingPageAudio) entries[entries.length - 1].pageHasAudio = true;
    if (pendingSupporting.length > 0) entries[entries.length - 1].supporting.push(...pendingSupporting);
  }
  return entries;
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
      return [{ lines: ['This exercise type cannot be reviewed.'] }];
  }
}

function flattenMatching(item: ExerciseOfType<'matching'>): TestResultPdfLineGroup[] {
  const groups: TestResultPdfLineGroup[] = [];
  if (item.studentAnswer === null) {
    groups.push({ heading: 'Your matches', lines: [EMPTY_ANSWER] });
  } else {
    item.itemResults.rounds.forEach((round, roundIndex) => {
      const heading = item.itemResults.rounds.length > 1 ? `Your matches — round ${roundIndex + 1}` : 'Your matches';
      groups.push({
        heading,
        lines: item.answerKey.pairs.map(pair => {
          const selection = round[pair.leftId];
          const rightValue =
            item.question.rightColumn.find(right => right.id === selection?.rightId)?.value ??
            (selection?.rightId ? selection.rightId : 'No match');
          const mark = selection?.rightId
            ? pointsLine(selection.points.awardedPoints, selection.points.maxPoints, selection.correct)
            : 'No match';
          return `${plain(pair.leftValue)} ↔ ${plain(rightValue)} (${mark})`;
        }),
      });
    });
  }
  groups.push({
    heading: 'Correct matches',
    lines: item.answerKey.pairs.map(pair => `${plain(pair.leftValue)} ↔ ${plain(pair.rightValue)}`),
  });
  return groups;
}

function flattenFill(item: ExerciseOfType<'fill'>): TestResultPdfLineGroup[] {
  return item.answerKey.items.map((keyItem, index) => {
    const result = item.itemResults.answers[index];
    const lines = [
      plain(keyItem.text),
      `Your answer: ${result?.value.trim() || EMPTY_ANSWER}`,
      result ? pointsLine(result.points.awardedPoints, result.points.maxPoints, result.correct) : 'Incorrect',
      `Accepted ${keyItem.acceptedAnswers.length > 1 ? 'answers' : 'answer'}: ${keyItem.acceptedAnswers.join(' or ')}`,
    ];
    const explanation = plain(keyItem.explanation);
    if (explanation) lines.push(`Explanation: ${explanation}`);
    return { heading: `Blank ${index + 1}`, lines };
  });
}

function flattenMultipleChoice(item: ExerciseOfType<'multiple-choice'>): TestResultPdfLineGroup[] {
  const selectedIds = new Set(item.itemResults.selectedOptionIds);
  const lines = [
    plain(item.question.question),
    ...item.answerKey.options.map(option => {
      const tags = [option.isCorrect ? 'correct' : null, selectedIds.has(option.id) ? 'your choice' : null].filter(
        Boolean
      );
      return `${plain(option.text)}${tags.length ? ` (${tags.join(', ')})` : ''}`;
    }),
    selectedIds.size > 0 ? 'Your answer is marked above.' : EMPTY_ANSWER,
    pointsLine(item.itemResults.points.awardedPoints, item.itemResults.points.maxPoints, item.itemResults.correct),
  ];
  const explanation = plain(item.explanation);
  if (explanation) lines.push(`Explanation: ${explanation}`);
  return [{ heading: 'Options', lines }];
}

function flattenOddOneOut(item: ExerciseOfType<'odd-one-out'>): TestResultPdfLineGroup[] {
  const lines = [
    plain(item.question.question),
    ...item.answerKey.items.map(entry => {
      const tags = [
        entry.isOddOneOut ? 'odd one out' : null,
        item.itemResults.selectedItemId === entry.id ? 'your choice' : null,
      ].filter(Boolean);
      return `${plain(entry.text)}${tags.length ? ` (${tags.join(', ')})` : ''}`;
    }),
  ];
  if (item.question.requireExplanation) {
    lines.push(`Your explanation: ${item.itemResults.explanation.trim() || EMPTY_ANSWER}`);
  }
  lines.push(
    item.itemResults.selectedItemId ? 'Your choice is marked above.' : EMPTY_ANSWER,
    pointsLine(item.itemResults.points.awardedPoints, item.itemResults.points.maxPoints, item.itemResults.correct)
  );
  const explanation = plain(item.explanation);
  if (explanation) lines.push(`Explanation: ${explanation}`);
  return [{ lines }];
}

function flattenTextSelection(item: ExerciseOfType<'text-selection'>): TestResultPdfLineGroup[] {
  const words = wordsFromHtml(item.question.passage);
  const groups: TestResultPdfLineGroup[] = [{ heading: 'Passage', lines: [plain(item.question.passage)] }];
  item.answerKey.questions.forEach((question, index) => {
    const result = item.itemResults.selections[index];
    const selectedWord = result && result.wordIndex >= 0 ? (words[result.wordIndex] ?? '—') : '—';
    const correctWord = words[question.correctWordIndex] ?? '—';
    const lines = [
      plain(question.text),
      `Your word: ${selectedWord}`,
      result ? pointsLine(result.points.awardedPoints, result.points.maxPoints, result.correct) : 'Incorrect',
      `Correct word: ${correctWord}`,
    ];
    const explanation = plain(question.explanation);
    if (explanation) lines.push(`Explanation: ${explanation}`);
    groups.push({ heading: `Question ${index + 1}`, lines });
  });
  return groups;
}

function flattenFillEmbolded(item: ExerciseOfType<'fill-embolded-text'>): TestResultPdfLineGroup[] {
  const groups: TestResultPdfLineGroup[] = [{ heading: 'Passage', lines: [plain(item.question.passage)] }];
  item.answerKey.words.forEach((word, index) => {
    const result = item.itemResults.answers[index];
    const lines = [
      ...(plain(word.question) ? [plain(word.question)] : []),
      `Your answer: ${result?.value.trim() || EMPTY_ANSWER}`,
      result ? pointsLine(result.points.awardedPoints, result.points.maxPoints, result.correct) : 'Incorrect',
      `Correct answer: ${word.correctAnswer}`,
    ];
    const explanation = plain(word.explanation);
    if (explanation) lines.push(`Explanation: ${explanation}`);
    groups.push({ heading: word.question ? `Question ${index + 1}` : `Word ${index + 1}`, lines });
  });
  return groups;
}

function flattenSentenceDiagram(item: ExerciseOfType<'sentence-diagramming'>): TestResultPdfLineGroup[] {
  const tokenText = (start: number, end: number) =>
    item.answerKey.tokens
      .filter(token => token.index >= start && token.index <= end)
      .map(token => token.text)
      .join(' ')
      .trim() || '(empty span)';
  const formatAnnotation = (
    annotation: ExerciseOfType<'sentence-diagramming'>['itemResults']['annotations'][number]
  ) => {
    const label = ANNOTATION_SPECS[annotation.kind]?.label ?? annotation.kind;
    return `${label}: ${tokenText(annotation.span.startTokenIndex, annotation.span.endTokenIndex)}`;
  };
  const groups: TestResultPdfLineGroup[] = [
    {
      lines: [
        plain(item.answerKey.latin),
        ...(item.answerKey.translation ? [`“${plain(item.answerKey.translation)}”`] : []),
      ],
    },
    {
      heading: 'Your diagram',
      lines:
        item.itemResults.annotations.length > 0 ? item.itemResults.annotations.map(formatAnnotation) : [EMPTY_ANSWER],
    },
    {
      heading: 'Correct diagram',
      lines: item.answerKey.solutionAnnotations.map(formatAnnotation),
    },
    {
      heading: 'Result',
      lines: [
        `${item.itemResults.accuracy}% of annotations matched.`,
        pointsLine(item.itemResults.points.awardedPoints, item.itemResults.points.maxPoints, item.itemResults.correct),
      ],
    },
  ];
  if (item.answerKey.explanation?.text) {
    groups.push({ heading: 'Explanation', lines: [plain(item.answerKey.explanation.text)] });
  }
  return groups;
}

function flattenTableFill(item: ExerciseOfType<'table-fill'>): TestResultPdfLineGroup[] {
  const resultsByCell = new Map(item.itemResults.cells.map(cell => [`${cell.rowId}-${cell.columnId}`, cell]));
  const lines: string[] = [];
  const title = plain(item.question.title);
  if (title) lines.push(title);
  const headers = item.question.columns.map(column => plain(column.header));
  if (headers.some(Boolean)) lines.push(formatTableRow(headers));
  for (const row of item.answerKey.rows) {
    const cells = item.question.columns.map(column => {
      const cell = row.cells[column.id];
      if (!cell) return '';
      if (!cell.isBlank) return plain(cell.content);
      const result = resultsByCell.get(`${row.id}-${column.id}`);
      const student = result?.value.trim() || EMPTY_ANSWER;
      const mark = result
        ? pointsLine(result.points.awardedPoints, result.points.maxPoints, result.correct)
        : 'Incorrect';
      return `${student} (answer: ${cell.answer ?? '—'}; ${mark})`;
    });
    lines.push(formatTableRow(cells));
  }
  for (const footnote of item.question.footnotes ?? []) {
    const text = plain(footnote);
    if (text) lines.push(text);
  }
  const explanation = plain(item.explanation);
  if (explanation) lines.push(`Explanation: ${explanation}`);
  return [{ lines }];
}

function flattenClickOnMultipleWords(item: ExerciseOfType<'click-on-multiple-words'>): TestResultPdfLineGroup[] {
  const words = wordsFromHtml(item.question.passage);
  const selected = new Set(item.itemResults.selectedWordIndices);
  const correct = new Set(item.answerKey.correctWordIndices);
  const labeledWords = words.map((word, index) => {
    const tags = [
      correct.has(index) && selected.has(index) ? 'correct and selected' : null,
      correct.has(index) && !selected.has(index) ? 'correct and missed' : null,
      selected.has(index) && !correct.has(index) ? 'selected and not required' : null,
    ].filter(Boolean);
    return tags.length ? `${word} (${tags.join(', ')})` : word;
  });
  const lines = [
    ...(plain(item.question.title) ? [plain(item.question.title)] : []),
    ...(plain(item.question.instructions) ? [plain(item.question.instructions)] : []),
    labeledWords.join(' '),
    selected.size > 0 ? `${selected.size} word${selected.size === 1 ? '' : 's'} selected.` : 'No words were selected.',
    pointsLine(item.itemResults.points.awardedPoints, item.itemResults.points.maxPoints, item.itemResults.correct),
  ];
  const explanation = plain(item.explanation);
  if (explanation) lines.push(`Explanation: ${explanation}`);
  return [{ heading: 'Passage', lines }];
}

function flattenGeneratedTranslation(item: ExerciseOfType<'generated-translation'>): TestResultPdfLineGroup[] {
  return item.answerKey.items.map((keyItem, index) => {
    const result = item.itemResults.answers[index];
    return {
      heading: `Item ${index + 1}`,
      lines: [
        plain(keyItem.text),
        `Your answer: ${result?.value.trim() || EMPTY_ANSWER}`,
        result ? pointsLine(result.points.awardedPoints, result.points.maxPoints, result.correct) : 'Incorrect',
        `Accepted ${keyItem.acceptedAnswers.length > 1 ? 'answers' : 'answer'}: ${keyItem.acceptedAnswers.join(' or ')}`,
      ],
    };
  });
}

function flattenGeneratedFormIdentification(
  item: ExerciseOfType<'generated-form-identification'>
): TestResultPdfLineGroup[] {
  return item.answerKey.items.map((keyItem, index) => {
    const result = item.itemResults.answers[index];
    const stepLabel = 'step' in keyItem ? keyItem.step : keyItem.steps.join(' · ');
    const accepted = 'acceptedAnswers' in keyItem ? keyItem.acceptedAnswers : null;
    const correctDisplay = 'correctAnswerDisplay' in keyItem ? keyItem.correctAnswerDisplay : '';
    const lines = [
      ...(keyItem.selected_form ? [`Selected form: ${keyItem.selected_form}`] : []),
      `Your answer: ${result?.value.trim() || EMPTY_ANSWER}`,
      result ? pointsLine(result.points.awardedPoints, result.points.maxPoints, result.correct) : 'Incorrect',
      accepted ? `Accepted answers: ${accepted.join(' or ')}` : `Correct answer: ${correctDisplay}`,
    ];
    return { heading: `${keyItem.word} — ${stepLabel}`, lines };
  });
}

function flattenTranslationGrading(item: ExerciseOfType<'translation-grading'>): TestResultPdfLineGroup[] {
  return item.itemResults.items.map((result, index) => {
    const latin = plain(item.answerKey.items[index]?.latinText);
    const instructions = plain(item.answerKey.items[index]?.instructions);
    const lines = [
      ...(latin ? [latin] : []),
      ...(instructions ? [instructions] : []),
      `Your translation: ${result.translation.trim() || EMPTY_ANSWER}`,
      result.score === null ? 'AI score: Not graded' : `AI score: ${result.score} / 10`,
      pointsLine(result.points.awardedPoints, result.points.maxPoints),
    ];
    if (result.feedback) lines.push(`AI feedback: ${result.feedback}`);
    return { heading: `Translation ${index + 1}`, lines };
  });
}

function summariesFromAttempt(attempt: StudentSubmittedTestAttempt): TestResultPdfModel['exerciseSummaries'] {
  return Object.values(attempt.exerciseResults).map((exercise, index) => ({
    number: index + 1,
    title: plain(exercise.title) || `Exercise ${index + 1}`,
    awardedPoints: formatScorePoints(exercise.awardedPoints),
    maxPoints: formatScorePoints(exercise.maxPoints),
  }));
}

export function buildTestResultPdfModel(input: {
  result: StudentTestResult;
  identity: ResultPdfStudentIdentity;
  source: ResultPdfSource;
}): TestResultPdfModel {
  const { result, identity, source } = input;
  const entries = buildReviewEntries(result);
  const poolItems = result.review?.content.vocabularyPool?.items;
  const exercises: TestResultPdfExercise[] = entries.map(entry => {
    const contextLines = [
      ...entry.pageTitles.map(title => `Page: ${title}`),
      ...(entry.pageHasAudio ? ['Audio attached'] : []),
      ...flattenSupporting(entry.supporting, entry.poolName, poolItems),
      ...audioNote(entry.exercise.audioPath),
    ];
    const instruction = plain(entry.exercise.instructions);
    const groups: TestResultPdfLineGroup[] = [];
    if (contextLines.length) groups.push({ heading: 'Context', lines: contextLines });
    if (instruction) groups.push({ heading: 'Instructions', lines: [instruction] });
    groups.push(...flattenExercise(entry.exercise));
    return {
      number: entry.number,
      title: plain(entry.exercise.title) || `Exercise ${entry.number}`,
      awardedPoints: formatScorePoints(entry.exercise.result.awardedPoints),
      maxPoints: formatScorePoints(entry.exercise.result.maxPoints),
      statusLabel: statusLabel(entry.exercise.result.awardedPoints, entry.exercise.result.maxPoints),
      groups,
    };
  });

  const exerciseSummaries =
    exercises.length > 0
      ? exercises.map(exercise => ({
          number: exercise.number,
          title: exercise.title,
          awardedPoints: exercise.awardedPoints,
          maxPoints: exercise.maxPoints,
        }))
      : summariesFromAttempt(result.attempt).map(({ number, title, awardedPoints, maxPoints }) => ({
          number,
          title,
          awardedPoints,
          maxPoints,
        }));

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
