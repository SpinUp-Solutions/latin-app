import type { VocabularyWord, VocabularyWordWithId } from './schemas';
import type { PartOfSpeech } from './schemas/enums';

export const VOCABULARY_WORD_UPDATE_REQUEST_STATUSES = ['pending', 'approved', 'dismissed'] as const;

export type VocabularyWordUpdateRequestStatus = (typeof VOCABULARY_WORD_UPDATE_REQUEST_STATUSES)[number];

/** Longest note an admin can leave on an update. */
export const VOCABULARY_WORD_UPDATE_NOTE_MAX_LENGTH = 4000;

export type WordChangeSummary = {
  /** Changed fields other than the inflection table, such as "translation". */
  fields: string[];
  /** Number of inflection-table cells that differ. */
  tableCells: number;
};

/** One row of the review list. The words themselves load with the detail. */
export type VocabularyWordUpdateRequestSummary = {
  id: string;
  status: VocabularyWordUpdateRequestStatus;
  wordId: string;
  /** The proposed headword. */
  word: string;
  part_of_speech: PartOfSpeech;
  translation: string;
  changes: WordChangeSummary;
  /** Why the change was proposed, shown to the reviewer. */
  reason: string | null;
  /** Where the proposal came from, such as an audit batch. */
  source: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VocabularyWordUpdateRequest = VocabularyWordUpdateRequestSummary & {
  proposedWord: VocabularyWord;
  /** The live word when the update was staged. */
  baseWord: VocabularyWord;
  baseFingerprint: string;
  /** Version of this request; saving or approving requires the version the admin reviewed. */
  version: string;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  /** The live word the approval replaced. */
  appliedFromWord: VocabularyWord | null;
  dismissedBy: string | null;
  dismissedReason: string | null;
};

export type VocabularyWordUpdateRequestDetail = {
  request: VocabularyWordUpdateRequest;
  /** The word as it is now, or null when it has been deleted. */
  liveWord: VocabularyWordWithId | null;
  /** Version of the live word; approving requires the version the admin reviewed. */
  liveFingerprint: string | null;
};

export type VocabularyWordUpdateRequestList = {
  requests: VocabularyWordUpdateRequestSummary[];
  /** True when there are more requests with this status than the list returns. */
  truncated: boolean;
};

/** An admin's note on an update, such as why the word is wrong. */
export type VocabularyWordUpdateNote = {
  id: string;
  text: string;
  authorName: string;
  createdAt: string;
  /** True for the signed-in admin's own notes, which they can delete. */
  mine: boolean;
};

export type VocabularyWordUpdateNoteList = {
  /** Oldest first. */
  notes: VocabularyWordUpdateNote[];
  /** True when there are older notes than the list returns. */
  truncated: boolean;
};
