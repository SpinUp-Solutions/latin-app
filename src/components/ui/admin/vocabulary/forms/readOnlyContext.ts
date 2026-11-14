import { createContext } from 'react';

/** True when the word editor only displays a word, so add and remove buttons are hidden. */
export const WordFormReadOnlyContext = createContext(false);
