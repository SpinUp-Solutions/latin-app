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
import { richTextToPlainText, stripHtmlTags } from '@/src/utils/exercises/helpers';

export type TestResultPdfTone = 'neutral' | 'student' | 'answer' | 'explanation' | 'feedback';

export interface TestResultPdfLineGroup {
  heading?: string;
  tone?: TestResultPdfTone;
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
  supporting: TestResultReviewSupportingItem[];
  pageTitles: string[];
  pageHasAudio: boolean;
  poolName?: string;
  exercise: TestResultReviewExerciseItem;
}

const EMPTY_ANSWER = 'No answer was recorded.';

const plain = (value?: string | null): string => (value ? richTextToPlainText(value) : '');

const wordsFromHtml = (html: string): string[] =>
  stripHtmlTags(html)
    .split(/\s+/)
    .filter(word => word.trim());

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

const withExplanation = (
  item: TestResultReviewExerciseItem,
  groups: TestResultPdfLineGroup[]
): TestResultPdfLineGroup[] => {
  const explanation = plain(item.explanation);
  if (!explanation) return groups;
  return [...groups, group('Explanation', [explanation], 'explanation')];
};

function flattenSupporting(
  items: TestResultReviewSupportingItem[],
  poolName?: string,
  poolItems?: Array<{ latin: string; english: string; pronunciation?: string | null; example?: string; notes?: string }>
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
        if (headers.some(Boolean)) lines.push(headers.join(' | '));
        for (const row of item.tableData.rows) {
          lines.push(
            [plain(row.rowHeader), ...item.tableData.columns.map(column => plain(row.cells[column.id]))]
              .filter(Boolean)
              .join(' | ')
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
          const extras = [word.pronunciation, word.partOfSpeech, word.example, word.notes].filter(Boolean);
          lines.push(`${word.latin} — ${word.english}${extras.length ? ` (${extras.join('; ')})` : ''}`);
        }
        break;
      }
      case 'vocabulary-pool': {
        lines.push(poolName ? `Vocabulary pool: ${poolName}` : 'Vocabulary pool');
        for (const word of poolItems ?? []) {
          const extras = [word.pronunciation, word.example, word.notes].filter(Boolean);
          lines.push(`${word.latin} — ${word.english}${extras.length ? ` (${extras.join('; ')})` : ''}`);
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
        if (latin) lines.push(`Latin: ${latin}`);
        if (translation) lines.push(`Translation: ${translation}`);
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
  const groups = (() => {
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
  })();
  return withExplanation(item, groups);
}

function flattenMatching(item: ExerciseOfType<'matching'>): TestResultPdfLineGroup[] {
  const scoredRounds = item.itemResults.rounds;
  const savedRounds = item.studentAnswer?.type === 'matching' ? item.studentAnswer.rounds : [];
  const roundCount = Math.max(scoredRounds.length, savedRounds.length);
  const groups: TestResultPdfLineGroup[] = [];

  if (roundCount === 0) {
    groups.push(group('Your matches', [EMPTY_ANSWER], 'student'));
  } else {
    for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
      const heading = roundCount > 1 ? `Your matches — round ${roundIndex + 1}` : 'Your matches';
      groups.push(
        group(
          heading,
          item.answerKey.pairs.map(pair => {
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
            return `${plain(pair.leftValue)} ↔ ${plain(rightValue) || 'No match'} (${mark})`;
          }),
          'student'
        )
      );
    }
  }

  groups.push(
    group(
      'Correct matches',
      item.answerKey.pairs.map(pair => `${plain(pair.leftValue)} ↔ ${plain(pair.rightValue)}`),
      'answer'
    )
  );
  return groups;
}

function flattenFill(item: ExerciseOfType<'fill'>): TestResultPdfLineGroup[] {
  const saved = item.studentAnswer?.type === 'fill' ? item.studentAnswer.answers : [];
  return item.answerKey.items.map((keyItem, index) => {
    const result = item.itemResults.answers[index];
    const studentValue = result?.value ?? saved[index];
    const lines = [
      plain(keyItem.text) || `Blank ${index + 1}`,
      `Your answer: ${recorded(studentValue)}`,
      result ? pointsLine(result.points.awardedPoints, result.points.maxPoints, result.correct) : 'Not scored',
      `Accepted ${keyItem.acceptedAnswers.length > 1 ? 'answers' : 'answer'}: ${keyItem.acceptedAnswers.join(' or ')}`,
    ];
    const explanation = plain(keyItem.explanation);
    if (explanation) lines.push(`Explanation: ${explanation}`);
    return group(`Blank ${index + 1}`, lines, result?.correct ? 'answer' : 'student');
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
  const groups: TestResultPdfLineGroup[] = [group('Question', [plain(item.question.question)])];
  groups.push(
    group('Your answer', selected.length > 0 ? selected.map(option => plain(option.text)) : [EMPTY_ANSWER], 'student')
  );
  groups.push(
    group(
      `Correct ${correct.length > 1 ? 'answers' : 'answer'}`,
      correct.map(option => plain(option.text)),
      'answer'
    )
  );
  groups.push(
    group(
      'All options',
      item.answerKey.options.map(option => {
        const tags = [option.isCorrect ? 'correct' : null, selectedIds.has(option.id) ? 'your choice' : null].filter(
          Boolean
        );
        return `${plain(option.text)}${tags.length ? ` (${tags.join(', ')})` : ''}`;
      })
    )
  );
  groups.push(
    group('Result', [
      pointsLine(item.itemResults.points.awardedPoints, item.itemResults.points.maxPoints, item.itemResults.correct),
    ])
  );
  return groups;
}

function flattenOddOneOut(item: ExerciseOfType<'odd-one-out'>): TestResultPdfLineGroup[] {
  const selectedId =
    item.itemResults.selectedItemId ||
    (item.studentAnswer?.type === 'odd-one-out' ? item.studentAnswer.selectedItemId : '');
  const selected = item.answerKey.items.find(entry => entry.id === selectedId);
  const oddOne = item.answerKey.items.find(entry => entry.isOddOneOut);
  const savedExplanation =
    item.itemResults.explanation || (item.studentAnswer?.type === 'odd-one-out' ? item.studentAnswer.explanation : '');
  const groups: TestResultPdfLineGroup[] = [group('Question', [plain(item.question.question)])];
  groups.push(group('Your choice', [recorded(selected ? plain(selected.text) : '')], 'student'));
  if (item.question.requireExplanation) {
    groups.push(group('Your explanation', multiline(savedExplanation), 'student'));
  }
  groups.push(group('Odd one out', [recorded(oddOne ? plain(oddOne.text) : '')], 'answer'));
  groups.push(
    group('All items', [
      ...item.answerKey.items.map(entry => {
        const tags = [entry.isOddOneOut ? 'odd one out' : null, entry.id === selectedId ? 'your choice' : null].filter(
          Boolean
        );
        return `${plain(entry.text)}${tags.length ? ` (${tags.join(', ')})` : ''}`;
      }),
      pointsLine(item.itemResults.points.awardedPoints, item.itemResults.points.maxPoints, item.itemResults.correct),
    ])
  );
  return groups;
}

function flattenTextSelection(item: ExerciseOfType<'text-selection'>): TestResultPdfLineGroup[] {
  const words = wordsFromHtml(item.question.passage);
  const savedIndices = item.studentAnswer?.type === 'text-selection' ? item.studentAnswer.selectedWordIndices : [];
  const groups: TestResultPdfLineGroup[] = [group('Passage', [plain(item.question.passage)])];
  item.answerKey.questions.forEach((question, index) => {
    const result = item.itemResults.selections[index];
    const wordIndex = result && result.wordIndex >= 0 ? result.wordIndex : (savedIndices[index] ?? -1);
    const selectedWord = wordIndex >= 0 ? (words[wordIndex] ?? `word ${wordIndex + 1}`) : '';
    const correctWord = words[question.correctWordIndex] ?? `word ${question.correctWordIndex + 1}`;
    const lines = [
      plain(question.text),
      `Your word: ${recorded(selectedWord)}`,
      result ? pointsLine(result.points.awardedPoints, result.points.maxPoints, result.correct) : 'Not scored',
      `Correct word: ${correctWord}`,
    ];
    const explanation = plain(question.explanation);
    if (explanation) lines.push(`Explanation: ${explanation}`);
    groups.push(group(`Question ${index + 1}`, lines, result?.correct ? 'answer' : 'student'));
  });
  return groups;
}

function flattenFillEmbolded(item: ExerciseOfType<'fill-embolded-text'>): TestResultPdfLineGroup[] {
  const saved = item.studentAnswer?.type === 'fill-embolded-text' ? item.studentAnswer.answers : [];
  const groups: TestResultPdfLineGroup[] = [group('Passage', [plain(item.question.passage)])];
  item.answerKey.words.forEach((word, index) => {
    const result = item.itemResults.answers[index];
    const studentValue = result?.value ?? saved[index];
    const lines = [
      ...(plain(word.question) ? [plain(word.question)] : []),
      `Your answer: ${recorded(studentValue)}`,
      result ? pointsLine(result.points.awardedPoints, result.points.maxPoints, result.correct) : 'Not scored',
      `Correct answer: ${word.correctAnswer}`,
    ];
    const explanation = plain(word.explanation);
    if (explanation) lines.push(`Explanation: ${explanation}`);
    groups.push(
      group(
        word.question ? `Question ${index + 1}` : `Word ${index + 1}`,
        lines,
        result?.correct ? 'answer' : 'student'
      )
    );
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
  const formatAnnotation = (annotation: { kind: string; span: { startTokenIndex: number; endTokenIndex: number } }) => {
    const label =
      annotation.kind in ANNOTATION_SPECS
        ? ANNOTATION_SPECS[annotation.kind as keyof typeof ANNOTATION_SPECS].label
        : annotation.kind;
    return `${label}: ${tokenText(annotation.span.startTokenIndex, annotation.span.endTokenIndex)}`;
  };
  const studentAnnotations =
    item.itemResults.annotations.length > 0
      ? item.itemResults.annotations
      : item.studentAnswer?.type === 'sentence-diagramming'
        ? item.studentAnswer.annotations
        : [];
  const groups: TestResultPdfLineGroup[] = [
    group('Sentence', [
      plain(item.answerKey.latin),
      ...(item.answerKey.translation ? [`“${plain(item.answerKey.translation)}”`] : []),
    ]),
    group(
      'Your diagram',
      studentAnnotations.length > 0 ? studentAnnotations.map(formatAnnotation) : [EMPTY_ANSWER],
      'student'
    ),
    group(
      'Correct diagram',
      item.answerKey.solutionAnnotations.length > 0
        ? item.answerKey.solutionAnnotations.map(formatAnnotation)
        : ['No solution annotations were recorded.'],
      'answer'
    ),
    group('Result', [
      `${item.itemResults.accuracy}% of annotations matched.`,
      pointsLine(item.itemResults.points.awardedPoints, item.itemResults.points.maxPoints, item.itemResults.correct),
    ]),
  ];
  if (item.answerKey.explanation?.text) {
    groups.push(group('Explanation', [plain(item.answerKey.explanation.text)], 'explanation'));
  }
  return groups;
}

function flattenTableFill(item: ExerciseOfType<'table-fill'>): TestResultPdfLineGroup[] {
  const resultsByCell = new Map(item.itemResults.cells.map(cell => [`${cell.rowId}-${cell.columnId}`, cell]));
  const saved = item.studentAnswer?.type === 'table-fill' ? item.studentAnswer.answers : {};
  const groups: TestResultPdfLineGroup[] = [];
  const title = plain(item.question.title);
  if (title) groups.push(group('Table', [title]));

  item.answerKey.rows.forEach((row, rowIndex) => {
    item.question.columns.forEach(column => {
      const cell = row.cells[column.id];
      if (!cell?.isBlank) return;
      const key = `${row.id}-${column.id}`;
      const result = resultsByCell.get(key);
      const studentValue = result?.value ?? saved[key];
      const heading = `${plain(column.header) || `Column ${column.id}`} · row ${rowIndex + 1}`;
      groups.push(
        group(
          heading,
          [
            `Your answer: ${recorded(studentValue)}`,
            result ? pointsLine(result.points.awardedPoints, result.points.maxPoints, result.correct) : 'Not scored',
            `Correct answer: ${recorded(cell.answer)}`,
          ],
          result?.correct ? 'answer' : 'student'
        )
      );
    });
  });

  const givenCells = item.answerKey.rows.flatMap((row, rowIndex) =>
    item.question.columns.flatMap(column => {
      const cell = row.cells[column.id];
      if (!cell || cell.isBlank) return [];
      return [`${plain(column.header) || column.id} · row ${rowIndex + 1}: ${plain(cell.content)}`];
    })
  );
  if (givenCells.length > 0) groups.push(group('Provided table text', givenCells));
  for (const footnote of item.question.footnotes ?? []) {
    const text = plain(footnote);
    if (text) groups.push(group('Footnote', [text]));
  }
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
  const selected = new Set(selectedIndices);
  const correct = new Set(item.answerKey.correctWordIndices);
  const wordAt = (index: number) => words[index] ?? `word ${index + 1}`;
  const groups: TestResultPdfLineGroup[] = [];
  if (plain(item.question.title)) groups.push(group('Title', [plain(item.question.title)]));
  if (plain(item.question.instructions)) groups.push(group('Instructions', [plain(item.question.instructions)]));
  groups.push(group('Passage', [plain(item.question.passage)]));
  groups.push(
    group(
      'Your selected words',
      selectedIndices.length > 0 ? selectedIndices.map(index => wordAt(index)) : [EMPTY_ANSWER],
      'student'
    )
  );
  groups.push(
    group(
      'Correct words',
      item.answerKey.correctWordIndices.length > 0
        ? item.answerKey.correctWordIndices.map(index => wordAt(index))
        : ['No correct words were recorded.'],
      'answer'
    )
  );
  const labeledWords = words.map((word, index) => {
    const tags = [
      correct.has(index) && selected.has(index) ? 'correct and selected' : null,
      correct.has(index) && !selected.has(index) ? 'correct and missed' : null,
      selected.has(index) && !correct.has(index) ? 'selected and not required' : null,
    ].filter(Boolean);
    return tags.length ? `${word} (${tags.join(', ')})` : word;
  });
  if (labeledWords.length > 0) groups.push(group('Passage with marks', [labeledWords.join(' ')]));
  groups.push(
    group('Result', [
      selected.size > 0
        ? `${selected.size} word${selected.size === 1 ? '' : 's'} selected.`
        : 'No words were selected.',
      pointsLine(item.itemResults.points.awardedPoints, item.itemResults.points.maxPoints, item.itemResults.correct),
    ])
  );
  return groups;
}

function flattenGeneratedTranslation(item: ExerciseOfType<'generated-translation'>): TestResultPdfLineGroup[] {
  const saved = item.studentAnswer?.type === 'generated-translation' ? item.studentAnswer.answers : [];
  return item.answerKey.items.map((keyItem, index) => {
    const result = item.itemResults.answers[index];
    const studentValue = result?.value ?? saved[index];
    return group(
      `Item ${index + 1}`,
      [
        plain(keyItem.text),
        `Your answer: ${recorded(studentValue)}`,
        result ? pointsLine(result.points.awardedPoints, result.points.maxPoints, result.correct) : 'Not scored',
        `Accepted ${keyItem.acceptedAnswers.length > 1 ? 'answers' : 'answer'}: ${keyItem.acceptedAnswers.join(' or ')}`,
      ],
      result?.correct ? 'answer' : 'student'
    );
  });
}

function flattenGeneratedFormIdentification(
  item: ExerciseOfType<'generated-form-identification'>
): TestResultPdfLineGroup[] {
  const saved = item.studentAnswer?.type === 'generated-form-identification' ? item.studentAnswer.answers : {};
  return item.answerKey.items.map((keyItem, index) => {
    const result = item.itemResults.answers[index];
    const studentValue = result?.value ?? saved[keyItem.id];
    const stepLabel = 'step' in keyItem ? keyItem.step : keyItem.steps.join(' · ');
    const accepted = 'acceptedAnswers' in keyItem ? keyItem.acceptedAnswers : null;
    const correctDisplay = 'correctAnswerDisplay' in keyItem ? keyItem.correctAnswerDisplay : '';
    const correctAnswer = 'correctAnswer' in keyItem ? keyItem.correctAnswer : '';
    const lines = [
      ...(keyItem.selected_form ? [`Selected form: ${keyItem.selected_form}`] : []),
      `Your answer: ${recorded(studentValue)}`,
      result ? pointsLine(result.points.awardedPoints, result.points.maxPoints, result.correct) : 'Not scored',
    ];
    if (accepted?.length) lines.push(`Accepted answers: ${accepted.join(' or ')}`);
    if (correctAnswer && !accepted?.includes(correctAnswer)) lines.push(`Correct answer: ${correctAnswer}`);
    if (correctDisplay && !accepted?.length) lines.push(`Correct answer: ${correctDisplay}`);
    return group(`${keyItem.word} — ${stepLabel}`, lines, result?.correct ? 'answer' : 'student');
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
    if (latin) groups.push(group(`Latin ${index + 1}`, [latin]));
    if (instructions) groups.push(group('Instructions', [instructions]));
    groups.push(group(`Your translation`, multiline(result?.translation ?? saved[index]), 'student'));
    groups.push(
      group(
        'AI grading',
        [
          result
            ? result.score === null
              ? 'AI score: Not graded'
              : `AI score: ${result.score} / 10`
            : 'AI score: Not graded',
          result ? pointsLine(result.points.awardedPoints, result.points.maxPoints) : 'Not scored',
        ],
        'feedback'
      )
    );
    if (result?.feedback) groups.push(group('AI feedback', multiline(result.feedback), 'feedback'));
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
    if (contextLines.length) groups.push(group('Context', contextLines));
    if (instruction) groups.push(group('Instructions', [instruction]));
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
