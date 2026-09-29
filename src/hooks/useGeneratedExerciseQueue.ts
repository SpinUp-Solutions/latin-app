import { useState } from 'react';

/** Keep prepared items in order; retry a whole word without changing its item identities. */
export function useGeneratedExerciseQueue(wordIds: Array<string | number>) {
  const [order, setOrder] = useState(() => wordIds.map((_, index) => index));

  function requeueWord(position: number) {
    const wordId = wordIds[order[position]];
    const firstStep = order.findIndex(index => wordIds[index] === wordId);
    setOrder([
      ...order.filter(index => wordIds[index] !== wordId),
      ...order.filter(index => wordIds[index] === wordId),
    ]);
    return firstStep;
  }

  return { order, requeueWord };
}
