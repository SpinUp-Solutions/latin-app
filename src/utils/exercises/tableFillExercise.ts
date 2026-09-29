import { TableFillExercise } from '@/src/types/exercise';

export const validateTableFillExercise = (userAnswers: Record<string, string>, exercise: TableFillExercise) => {
  const cellResults: Record<string, boolean> = {};
  let correctAnswers = 0;
  let totalBlanks = 0;

  exercise.data.rows.forEach(row => {
    exercise.data.columns.forEach(column => {
      const cellKey = `${row.id}-${column.id}`;
      const cell = row.cells[column.id];

      if (cell?.isBlank && cell.answer) {
        totalBlanks++;
        const isMatch = (userAnswers[cellKey] || '').trim().toLowerCase() === cell.answer.trim().toLowerCase();
        cellResults[cellKey] = isMatch;
        if (isMatch) correctAnswers++;
      }
    });
  });

  return {
    isCorrect: correctAnswers === totalBlanks && totalBlanks > 0,
    correctAnswers,
    totalBlanks,
    cellResults,
  };
};
