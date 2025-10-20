export type VerbFormPath = {
  tense: string;
  voice: string;
  mood: string;
  person: string;
  number: string;
};

export type NounFormPath = {
  number: string;
  case: string;
};

export type AdjectiveFormPath = {
  degree: string;
  gender: string;
  number: string;
  case: string;
};

export type PronounFormPath = {
  gender: string;
  number: string;
  case: string;
};

export type AdverbFormPath = {
  degree: string;
};

export type ExerciseWordResponse =
  | {
      id: string;
      root_word: string;
      selected_form: string;
      part_of_speech: 'verb';
      form_path: VerbFormPath | null;
      conjugation?: string;
      definitions?: string[];
      is_deponent?: boolean;
    }
  | {
      id: string;
      root_word: string;
      selected_form: string;
      part_of_speech: 'noun';
      form_path: NounFormPath | null;
      declension?: string;
      definitions?: string[];
      gender?: string;
    }
  | {
      id: string;
      root_word: string;
      selected_form: string;
      part_of_speech: 'adjective';
      form_path: AdjectiveFormPath | null;
      declension?: string;
      definitions?: string[];
    }
  | {
      id: string;
      root_word: string;
      selected_form: string;
      part_of_speech: 'pronoun';
      form_path: PronounFormPath | null;
      definitions?: string[];
    }
  | {
      id: string;
      root_word: string;
      selected_form: string;
      part_of_speech: 'adverb';
      form_path: AdverbFormPath | null;
      definitions?: string[];
    }
  | {
      id: string;
      root_word: string;
      selected_form: string;
      part_of_speech: 'preposition' | 'conjunction' | 'interjection';
      form_path: null;
      definitions?: string[];
    };
