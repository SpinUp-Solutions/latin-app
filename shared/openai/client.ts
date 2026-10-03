import OpenAI from 'openai';

let openAIClient: OpenAI | undefined;

// Built on first use so Firestore-only callable functions, which import this
// module without the OpenAI secret, never construct a client.
export const openai = {
  get responses() {
    openAIClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openAIClient.responses;
  },
};

export const DEFAULT_MODEL = 'gpt-5.4-mini';
export const AUTOCOMPLETE_MODEL = 'gpt-5.4-mini';

export const MAX_TOKENS = 32000;
