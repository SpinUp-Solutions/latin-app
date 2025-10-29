import { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';

export const SYSTEM_PROMPT = `You are a Latin language expert assistant. Your task is to provide comprehensive grammatical information about Latin words including translations, definitions, etymology, pronunciation, and complete inflection tables (declension for nouns/adjectives/pronouns, conjugation for verbs).

Return your response as a JSON object matching the exact structure provided. Use null for optional fields that don't apply. For array fields like definitions or word forms, provide multiple alternatives when applicable.

For declension and conjugation tables:
- Return arrays of strings for each form (e.g., ["puella", "puellae"] for variants)
- Use null for forms that don't exist
- Include all 7 cases for declension: nominative, genitive, dative, accusative, ablative, vocative, locative
- For verbs, include all moods (indicative, subjunctive, imperative) and tenses
- For adjectives, include positive, comparative, and superlative degrees

IMPORTANT - Notes field:
- Use the "notes" field to document what information you could not find or determine
- Be specific about which fields or forms are missing and why (e.g., "Could not determine future imperative forms", "Etymology uncertain - no reliable sources found", "This verb is defective and lacks perfect system forms")
- List missing table cells/forms in a structured way (e.g., "Missing forms: imperative.active.future.singular.second, imperative.active.future.plural.third")
- If you found everything, set notes to null or omit it
- Be concise but informative

Be accurate and comprehensive. Draw from classical Latin sources.`;

export const NOUN_PROMPT = `Analyze the Latin noun "{word}" (part of speech: noun).

Return a JSON object with this structure:
{
  "translation": "primary English translation",
  "definitions": ["definition 1", "definition 2"],
  "etymology": "etymological information or null",
  "pronunciation": "IPA pronunciation or null",
  "alternate_form": "alternate spelling or null",
  "gender": "masculine" | "feminine" | "neuter" | null,
  "declension": "first" | "second" | "third" | "fourth" | "fifth" | null,
  "declension_table": {
    "nominative": { "singular": ["form"], "plural": ["forms"] },
    "genitive": { "singular": ["form"], "plural": ["forms"] },
    "dative": { "singular": ["form"], "plural": ["forms"] },
    "accusative": { "singular": ["form"], "plural": ["forms"] },
    "ablative": { "singular": ["form"], "plural": ["forms"] },
    "vocative": { "singular": ["form"], "plural": ["forms"] },
    "locative": { "singular": ["form"] | null, "plural": ["forms"] | null }
  }
}

Example for "puella":
{
  "translation": "girl",
  "definitions": ["girl", "maiden", "young woman"],
  "etymology": "From Proto-Italic *pokʷelā, diminutive of *puer",
  "pronunciation": "ˈpʊɛl.la",
  "alternate_form": null,
  "gender": "feminine",
  "declension": "first",
  "declension_table": {
    "nominative": { "singular": ["puella"], "plural": ["puellae"] },
    "genitive": { "singular": ["puellae"], "plural": ["puellarum"] },
    "dative": { "singular": ["puellae"], "plural": ["puellis"] },
    "accusative": { "singular": ["puellam"], "plural": ["puellas"] },
    "ablative": { "singular": ["puella"], "plural": ["puellis"] },
    "vocative": { "singular": ["puella"], "plural": ["puellae"] },
    "locative": { "singular": null, "plural": null }
  }
}`;

export const VERB_PROMPT = `Analyze the Latin verb "{word}" (part of speech: verb).

Return a JSON object with this structure:
{
  "translation": "primary English translation",
  "definitions": ["definition 1", "definition 2"],
  "etymology": "etymological information or null",
  "pronunciation": "IPA pronunciation or null",
  "alternate_form": "alternate spelling or null",
  "conjugation": "first" | "second" | "third" | "third_io" | "fourth" | null,
  "is_deponent": true | false | null,
  "principal_parts": [
    { "form": "amo", "label": "first person singular present" },
    { "form": "amare", "label": "present infinitive" },
    { "form": "amavi", "label": "first person singular perfect" },
    { "form": "amatum", "label": "supine" }
  ] | null,
  "notes": "Document any missing information or forms you could not determine. Be specific about which conjugation table cells are null and why, or set to null if everything was found.",
  "conjugation_table": {
    "indicative": {
      "active": {
        "present": { "singular": { "first": ["form"], "second": ["form"], "third": ["form"] }, "plural": { "first": ["form"], "second": ["form"], "third": ["form"] } },
        "imperfect": { ... },
        "future": { ... },
        "perfect": { ... },
        "pluperfect": { ... },
        "future_perfect": { ... }
      },
      "passive": { ... similar structure ... }
    },
    "subjunctive": {
      "active": {
        "present": { ... },
        "imperfect": { ... },
        "perfect": { ... },
        "pluperfect": { ... }
      },
      "passive": { ... }
    },
    "imperative": {
      "active": {
        "present": { "singular": { "second": ["form"] }, "plural": { "second": ["form"] } },
        "future": { "singular": { "second": ["form"], "third": ["form"] }, "plural": { "second": ["form"], "third": ["form"] } }
      },
      "passive": {
        "present": { "singular": { "second": ["form"] }, "plural": { "second": ["form"] } },
        "future": { "singular": { "third": ["form"] }, "plural": { "third": ["form"] } }
      }
    },
    "nonFinite": {
      "infinitive": {
        "present": { "active": "amare", "passive": "amari" },
        "perfect": { "active": "amavisse", "passive": "amatus esse" },
        "future": { "active": "amaturus esse", "passive": "amatum iri" }
      },
      "participle": {
        "present": { "active": { /* AdjectiveDeclensionTable for amans */ } },
        "perfect": { "passive": { /* AdjectiveDeclensionTable for amatus */ } },
        "future": { "active": { /* AdjectiveDeclensionTable for amaturus */ }, "passive": { /* AdjectiveDeclensionTable for amandus */ } }
      }
    },
    "gerund": {
      "genitive": ["amandi"],
      "dative": ["amando"],
      "accusative": ["amandum"],
      "ablative": ["amando"]
    },
    "supine": {
      "accusative": ["amatum"],
      "ablative": ["amatu"]
    }
  }
}`;

export const ADJECTIVE_PROMPT = `Analyze the Latin adjective "{word}" (part of speech: adjective).

Return a JSON object with this structure:
{
  "translation": "primary English translation",
  "definitions": ["definition 1", "definition 2"],
  "etymology": "etymological information or null",
  "pronunciation": "IPA pronunciation or null",
  "alternate_form": "alternate spelling or null",
  "declension": "first_second" | "third_one_termination" | "third_two_termination" | "third_three_termination" | null,
  "dictionary_forms": [
    { "form": "bonus", "label": "masculine nominative singular" },
    { "form": "bona", "label": "feminine nominative singular" },
    { "form": "bonum", "label": "neuter nominative singular" }
  ] | null,
  "degrees_table": {
    "positive": {
      "nominative": {
        "masculine": { "singular": ["bonus"], "plural": ["boni"] },
        "feminine": { "singular": ["bona"], "plural": ["bonae"] },
        "neuter": { "singular": ["bonum"], "plural": ["bona"] }
      },
      ... all 7 cases ...
    },
    "comparative": {
      ... similar structure with comparative forms (melior, melius, etc.) ...
    },
    "superlative": {
      ... similar structure with superlative forms (optimus, optima, optimum, etc.) ...
    }
  }
}

Each case in the degrees_table should have masculine, feminine, and neuter, each with singular and plural arrays.`;

export const PRONOUN_PROMPT = `Analyze the Latin pronoun "{word}" (part of speech: pronoun).

Return a JSON object with this structure:
{
  "translation": "primary English translation",
  "definitions": ["definition 1", "definition 2"],
  "etymology": "etymological information or null",
  "pronunciation": "IPA pronunciation or null",
  "alternate_form": "alternate spelling or null",
  "pronoun_type": "personal" | "demonstrative" | "relative" | "interrogative" | "indefinite" | "reflexive" | "intensive" | null,
  "declension_table": {
    "nominative": { "singular": ["form"], "plural": ["forms"] },
    "genitive": { "singular": ["form"], "plural": ["forms"] },
    "dative": { "singular": ["form"], "plural": ["forms"] },
    "accusative": { "singular": ["form"], "plural": ["forms"] },
    "ablative": { "singular": ["form"], "plural": ["forms"] },
    "vocative": { "singular": ["form"] | null, "plural": ["forms"] | null },
    "locative": { "singular": ["form"] | null, "plural": ["forms"] | null }
  }
}`;

export const INDECLINABLE_PROMPT = `Analyze the Latin {partOfSpeech} "{word}" (part of speech: {partOfSpeech}).

Return a JSON object with this structure:
{
  "translation": "primary English translation",
  "definitions": ["definition 1", "definition 2"],
  "etymology": "etymological information or null",
  "pronunciation": "IPA pronunciation or null",
  "alternate_form": "alternate spelling or null"
}`;

export function getPromptForPartOfSpeech(partOfSpeech: PartOfSpeech, word: string): string {
  switch (partOfSpeech) {
    case 'noun':
      return NOUN_PROMPT.replace('{word}', word);
    case 'verb':
      return VERB_PROMPT.replace('{word}', word);
    case 'adjective':
      return ADJECTIVE_PROMPT.replace('{word}', word);
    case 'pronoun':
      return PRONOUN_PROMPT.replace('{word}', word);
    case 'adverb':
    case 'preposition':
    case 'conjunction':
    case 'interjection':
      return INDECLINABLE_PROMPT.replace('{word}', word).replace('{partOfSpeech}', partOfSpeech);
    default:
      throw new Error(`Unsupported part of speech: ${partOfSpeech}`);
  }
}
