import { GoogleGenAI } from '@google/genai';

export const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';

export const GEMINI_TEMPERATURE = 0.2;

export const GEMINI_MAX_TOKENS = 16000;
