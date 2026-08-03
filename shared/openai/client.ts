import OpenAI from 'openai';

let openAIClient: OpenAI | undefined;

const getOpenAIClient = () => {
  openAIClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openAIClient;
};

// Keep Firestore-only callable functions free of the OpenAI secret. Importing
// this shared module no longer constructs a client until an AI handler actually
// accesses the Responses API.
export const openai = {
  get responses() {
    return getOpenAIClient().responses;
  },
};

export const DEFAULT_MODEL = 'gpt-5.4-mini';
export const AUTOCOMPLETE_MODEL = 'gpt-5.4-mini';

export const DEFAULT_TEMPERATURE = 0.2;

export const MAX_TOKENS = 32000;
