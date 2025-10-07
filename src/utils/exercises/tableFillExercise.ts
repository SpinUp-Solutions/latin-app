import { TableFillExercise } from '@/src/types/exercise';

export interface TableFillValidationResult {
  isCorrect: boolean;
  correctAnswers: number;
  totalBlanks: number;
  cellResults: Record<string, boolean>;
  incorrectCells: string[];
}

export const validateTableFillExercise = (
  userAnswers: Record<string, string>,
  exercise: TableFillExercise
): TableFillValidationResult => {
  const cellResults: Record<string, boolean> = {};
  const incorrectCells: string[] = [];
  let correctAnswers = 0;
  let totalBlanks = 0;

  exercise.data.rows.forEach(row => {
    exercise.data.columns.forEach(column => {
      const cellKey = `${row.id}-${column.id}`;
      const cell = row.cells[column.id];

      if (cell?.isBlank && cell.answer) {
        totalBlanks++;
        const userAnswer = (userAnswers[cellKey] || '').trim();
        const correctAnswer = cell.answer.trim();

        const isMatch = userAnswer.toLowerCase() === correctAnswer.toLowerCase();

        cellResults[cellKey] = isMatch;

        if (isMatch) {
          correctAnswers++;
        } else {
          incorrectCells.push(cellKey);
        }
      }
    });
  });

  return {
    isCorrect: correctAnswers === totalBlanks && totalBlanks > 0,
    correctAnswers,
    totalBlanks,
    cellResults,
    incorrectCells,
  };
};
