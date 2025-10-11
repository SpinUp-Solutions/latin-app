export { BaseWord } from './base-word';
export { Noun } from './noun';
export { Verb } from './verb';
export { Pronoun } from './pronoun';
export { Adjective } from './adjective';
export { Adverb, Preposition, Conjunction, Interjection } from './indeclinable-words';

import { Noun } from './noun';
import { Verb } from './verb';
import { Pronoun } from './pronoun';
import { Adjective } from './adjective';
import { Adverb, Preposition, Conjunction, Interjection } from './indeclinable-words';

export type VocabularyWord = Noun | Verb | Pronoun | Adjective | Adverb | Preposition | Conjunction | Interjection;

export type VocabularyWordWithId = VocabularyWord & { id: string };
