import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const DEFAULT_MODEL = 'gpt-5-mini';
export const AUTOCOMPLETE_MODEL = 'gpt-5.1';
export const TRANSLATION_GRADING_MODEL = 'gpt-5-mini';

export const DEFAULT_TEMPERATURE = 0.2;

export const MAX_TOKENS = 16000;
