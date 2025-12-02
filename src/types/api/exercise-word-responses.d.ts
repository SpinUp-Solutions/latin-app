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
      primary_form_paths?: VerbFormPath[];
      optional_form_paths?: VerbFormPath[];
      conjugation?: string;
      definitions?: string[];
      is_deponent?: boolean;
      translation?: string;
    }
  | {
      id: string;
      root_word: string;
      selected_form: string;
      part_of_speech: 'noun';
      form_path: NounFormPath | null;
      primary_form_paths?: NounFormPath[];
      optional_form_paths?: NounFormPath[];
      declension?: string;
      definitions?: string[];
      gender?: string;
      translation?: string;
    }
  | {
      id: string;
      root_word: string;
      selected_form: string;
      part_of_speech: 'adjective';
      form_path: AdjectiveFormPath | null;
      primary_form_paths?: AdjectiveFormPath[];
      optional_form_paths?: AdjectiveFormPath[];
      declension?: string;
      definitions?: string[];
      translation?: string;
    }
  | {
      id: string;
      root_word: string;
      selected_form: string;
      part_of_speech: 'pronoun';
      form_path: PronounFormPath | null;
      primary_form_paths?: PronounFormPath[];
      optional_form_paths?: PronounFormPath[];
      definitions?: string[];
      translation?: string;
    }
  | {
      id: string;
      root_word: string;
      selected_form: string;
      part_of_speech: 'adverb';
      form_path: AdverbFormPath | null;
      primary_form_paths?: AdverbFormPath[];
      optional_form_paths?: AdverbFormPath[];
      definitions?: string[];
      translation?: string;
    }
  | {
      id: string;
      root_word: string;
      selected_form: string;
      part_of_speech: 'preposition' | 'conjunction' | 'interjection';
      form_path: null;
      primary_form_paths?: never;
      optional_form_paths?: never;
      definitions?: string[];
      translation?: string;
    };
