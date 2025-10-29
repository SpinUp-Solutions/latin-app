import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.error('[OpenAI Client] OPENAI_API_KEY environment variable is not set');
  console.error('[OpenAI Client] Please add OPENAI_API_KEY to your .env.local or .env.development file');
  throw new Error('OPENAI_API_KEY environment variable is not set. Check server logs for details.');
}

console.log('[OpenAI Client] OpenAI client initialized successfully');
console.log('[OpenAI Client] API Key present:', process.env.OPENAI_API_KEY ? 'Yes (hidden)' : 'No');

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';

export const DEFAULT_TEMPERATURE = 0.2;

export const MAX_TOKENS = 16000;
