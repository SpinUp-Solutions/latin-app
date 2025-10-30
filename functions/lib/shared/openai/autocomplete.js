"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.autocompleteVocabularyWord = autocompleteVocabularyWord;
const zod_1 = require("openai/helpers/zod");
const client_1 = require("./client");
const prompts_1 = require("./prompts");
const ai_1 = require("../types/vocabulary/ai");
function getSchemaFields(schema) {
    return schema.keyof().options;
}
const PART_OF_SPEECH_CONFIG = {
    verb: {
        schema: ai_1.VerbStructuredOutputSchema,
        partOfSpeech: 'verb',
    },
    noun: {
        schema: ai_1.NounStructuredOutputSchema,
        partOfSpeech: 'noun',
    },
    adjective: {
        schema: ai_1.AdjectiveStructuredOutputSchema,
        partOfSpeech: 'adjective',
    },
    pronoun: {
        schema: ai_1.PronounStructuredOutputSchema,
        partOfSpeech: 'pronoun',
    },
    adverb: {
        schema: ai_1.AdverbStructuredOutputSchema,
        partOfSpeech: 'adverb',
    },
    preposition: {
        schema: ai_1.PrepositionStructuredOutputSchema,
        partOfSpeech: 'preposition',
    },
    conjunction: {
        schema: ai_1.ConjunctionStructuredOutputSchema,
        partOfSpeech: 'conjunction',
    },
    interjection: {
        schema: ai_1.InterjectionStructuredOutputSchema,
        partOfSpeech: 'interjection',
    },
};
function selectFields(partOfSpeech, fields) {
    const config = PART_OF_SPEECH_CONFIG[partOfSpeech];
    if (!config) {
        return [];
    }
    const schemaFields = getSchemaFields(config.schema);
    if (!fields || fields.length === 0) {
        return schemaFields;
    }
    return fields.filter(field => schemaFields.includes(field));
}
function isValueEmpty(value) {
    if (value === undefined || value === null || value === '') {
        return true;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return true;
        }
        return value.every(item => isValueEmpty(item));
    }
    if (typeof value === 'object' && value !== null) {
        const obj = value;
        if ('full_form' in obj && 'shortened_form' in obj) {
            const fullFormEmpty = isValueEmpty(obj.full_form);
            const shortenedFormEmpty = isValueEmpty(obj.shortened_form);
            return fullFormEmpty && shortenedFormEmpty;
        }
        const objValues = Object.values(obj);
        if (objValues.length === 0) {
            return true;
        }
        return objValues.every(v => isValueEmpty(v));
    }
    return false;
}
function shouldOverwrite(existingValue, overwriteExisting) {
    if (overwriteExisting) {
        return true;
    }
    return isValueEmpty(existingValue);
}
function isWordForm(value) {
    return (typeof value === 'object' &&
        value !== null &&
        ('full_form' in value || 'shortened_form' in value));
}
function isWordFormIncomplete(value) {
    if (!isWordForm(value)) {
        return false;
    }
    const fullFormEmpty = isValueEmpty(value.full_form);
    const shortenedFormEmpty = isValueEmpty(value.shortened_form);
    return fullFormEmpty || shortenedFormEmpty;
}
function mergeWordForm(existing, incoming) {
    return {
        full_form: incoming.full_form || existing.full_form || '',
        shortened_form: incoming.shortened_form || existing.shortened_form || '',
    };
}
function mergeValue(existingValue, incomingValue, overwriteExisting) {
    if (overwriteExisting) {
        return incomingValue;
    }
    if (Array.isArray(existingValue) && Array.isArray(incomingValue)) {
        if (existingValue.length === 0) {
            return incomingValue;
        }
        if (incomingValue.length === 0) {
            return existingValue;
        }
        if (existingValue.length !== incomingValue.length) {
            return incomingValue;
        }
        return existingValue.map((existingItem, index) => {
            const incomingItem = incomingValue[index];
            if (isWordForm(existingItem) && isWordForm(incomingItem)) {
                return mergeWordForm(existingItem, incomingItem);
            }
            return shouldOverwrite(existingItem, overwriteExisting) ? incomingItem : existingItem;
        });
    }
    if (isWordForm(existingValue) && isWordForm(incomingValue)) {
        return mergeWordForm(existingValue, incomingValue);
    }
    return shouldOverwrite(existingValue, overwriteExisting) ? incomingValue : existingValue;
}
function calculateCost(usage) {
    var _a, _b, _c;
    const promptTokens = (_a = usage.prompt_tokens) !== null && _a !== void 0 ? _a : 0;
    const completionTokens = (_b = usage.completion_tokens) !== null && _b !== void 0 ? _b : 0;
    const totalTokens = (_c = usage.total_tokens) !== null && _c !== void 0 ? _c : 0;
    const inputCostPer1M = 0.25;
    const outputCostPer1M = 2.0;
    const inputCost = (promptTokens / 1000000) * inputCostPer1M;
    const outputCost = (completionTokens / 1000000) * outputCostPer1M;
    const totalCost = inputCost + outputCost;
    return {
        inputCost,
        outputCost,
        totalCost,
        tokens: {
            promptTokens,
            completionTokens,
            totalTokens,
        },
    };
}
async function autocompleteVocabularyWord(request) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    console.log('[Autocomplete] Starting autocomplete for:', request.word, request.part_of_speech);
    const config = PART_OF_SPEECH_CONFIG[request.part_of_speech];
    if (!config) {
        console.error('[Autocomplete] Unsupported part of speech:', request.part_of_speech);
        return { success: false, error: `Unsupported part of speech: ${request.part_of_speech}` };
    }
    console.log('[Autocomplete] Using schema:', config.schema.constructor.name);
    console.log('[Autocomplete] Model:', client_1.DEFAULT_MODEL);
    console.log('[Autocomplete] Temperature:', client_1.DEFAULT_TEMPERATURE);
    console.log('[Autocomplete] Max tokens:', client_1.MAX_TOKENS);
    try {
        console.log('[Autocomplete] Calling OpenAI API...');
        console.log('[Autocomplete] Request details:', {
            model: client_1.DEFAULT_MODEL,
            maxTokens: client_1.MAX_TOKENS,
            schemaName: `${request.part_of_speech}_structured_output`,
        });
        const responseFormat = (0, zod_1.zodResponseFormat)(config.schema, `${request.part_of_speech}_structured_output`);
        const startTime = Date.now();
        const response = await client_1.openai.responses.create({
            model: client_1.DEFAULT_MODEL,
            reasoning: { effort: 'low' },
            service_tier: 'priority',
            max_output_tokens: client_1.MAX_TOKENS,
            instructions: prompts_1.SYSTEM_PROMPT,
            input: (0, prompts_1.getPromptForPartOfSpeech)(request.part_of_speech, request.word),
            text: {
                format: {
                    type: 'json_schema',
                    name: responseFormat.json_schema.name,
                    schema: responseFormat.json_schema.schema,
                    strict: (_a = responseFormat.json_schema.strict) !== null && _a !== void 0 ? _a : true,
                },
            },
        });
        const endTime = Date.now();
        console.log('[Autocomplete] OpenAI API response received in', endTime - startTime, 'ms');
        console.log('[Autocomplete] Response ID:', response.id);
        console.log('[Autocomplete] Response model:', response.model);
        console.log('[Autocomplete] Output items count:', ((_b = response.output) === null || _b === void 0 ? void 0 : _b.length) || 0);
        console.log('[Autocomplete] Usage:', JSON.stringify(response.usage, null, 2));
        console.log('[Autocomplete] Full response object keys:', Object.keys(response));
        const messageItem = response.output.find(item => item.type === 'message');
        if (!messageItem || messageItem.type !== 'message') {
            console.error('[Autocomplete] No message item in response');
            return { success: false, error: 'No response from the model' };
        }
        console.log('[Autocomplete] Message status:', messageItem.status);
        if (messageItem.status === 'incomplete') {
            console.error('[Autocomplete] Response incomplete');
            return { success: false, error: 'Response was incomplete' };
        }
        const textContent = messageItem.content.find(c => c.type === 'output_text');
        if (!textContent || textContent.type !== 'output_text') {
            console.error('[Autocomplete] No text content in message');
            return { success: false, error: 'No text content in response' };
        }
        console.log('[Autocomplete] Parsing structured output...');
        const structured = JSON.parse(textContent.text);
        if (!structured) {
            console.error('[Autocomplete] No structured output in message');
            console.error('[Autocomplete] Message content:', textContent.text);
            return { success: false, error: 'No structured output returned by the model' };
        }
        console.log('[Autocomplete] Structured output received:', Object.keys(structured));
        console.log('[Autocomplete] Full structured output:', JSON.stringify(structured, null, 2));
        if ('principal_parts' in structured) {
            console.log('[Autocomplete] Principal parts in AI response:', JSON.stringify(structured.principal_parts, null, 2));
        }
        if ('nominative_singular' in structured) {
            console.log('[Autocomplete] Nominative singular in AI response:', JSON.stringify(structured.nominative_singular, null, 2));
        }
        if ('genitive_singular' in structured) {
            console.log('[Autocomplete] Genitive singular in AI response:', JSON.stringify(structured.genitive_singular, null, 2));
        }
        if ('alternate_form' in structured) {
            console.log('[Autocomplete] Alternate form in AI response:', JSON.stringify(structured.alternate_form, null, 2));
        }
        if ('notes' in structured) {
            console.log('[Autocomplete] Notes in AI response:', structured.notes);
        }
        if ('conjugation_table' in structured && structured.conjugation_table) {
            const participles = (_d = (_c = structured.conjugation_table) === null || _c === void 0 ? void 0 : _c.nonFinite) === null || _d === void 0 ? void 0 : _d.participle;
            console.log('[Autocomplete] Participles in AI response:', JSON.stringify(participles, null, 2));
            console.log('[Autocomplete] Present active participle:', (_e = participles === null || participles === void 0 ? void 0 : participles.present) === null || _e === void 0 ? void 0 : _e.active);
            console.log('[Autocomplete] Perfect passive participle:', (_f = participles === null || participles === void 0 ? void 0 : participles.perfect) === null || _f === void 0 ? void 0 : _f.passive);
            console.log('[Autocomplete] Future active participle:', (_g = participles === null || participles === void 0 ? void 0 : participles.future) === null || _g === void 0 ? void 0 : _g.active);
        }
        const existing = (_h = request.existingData) !== null && _h !== void 0 ? _h : {};
        console.log('[Autocomplete] Existing data fields:', Object.keys(existing));
        console.log('[Autocomplete] Existing principal_parts:', existing.principal_parts);
        console.log('[Autocomplete] Existing alternate_form:', existing.alternate_form);
        const selectedFields = request.fieldsToComplete
            ? selectFields(request.part_of_speech, request.fieldsToComplete)
            : getSchemaFields(config.schema);
        console.log('[Autocomplete] Selected fields to process:', selectedFields);
        const data = {
            part_of_speech: config.partOfSpeech,
        };
        for (const field of selectedFields) {
            const structuredValue = structured[field];
            const existingValue = existing[field];
            data[field] = mergeValue(existingValue, structuredValue, request.overwriteExisting);
        }
        const cost = response.usage ? calculateCost(response.usage) : undefined;
        const fieldStatus = {};
        const allExpectedFields = getSchemaFields(config.schema);
        for (const field of allExpectedFields) {
            const existingValue = existing[field];
            const structuredValue = structured[field];
            const mergedValue = data[field];
            const wasIncompleteOrEmpty = isValueEmpty(existingValue) ||
                (Array.isArray(existingValue) && existingValue.some(item => isWordFormIncomplete(item))) ||
                isWordFormIncomplete(existingValue);
            if (wasIncompleteOrEmpty) {
                const isNowComplete = !isValueEmpty(mergedValue) &&
                    (Array.isArray(mergedValue) ? mergedValue.every(item => !isWordFormIncomplete(item)) : !isWordFormIncomplete(mergedValue));
                const aiProvidedValue = !isValueEmpty(structuredValue);
                fieldStatus[field] = (isNowComplete && aiProvidedValue) ? 'filled' : 'missing';
            }
        }
        const notes = 'notes' in structured ? structured.notes : undefined;
        console.log('[Autocomplete] Field status:', fieldStatus);
        console.log('[Autocomplete] Success! Generated fields:', Object.keys(data));
        console.log('[Autocomplete] Data being returned to client:', JSON.stringify(data, null, 2));
        console.log('[Autocomplete] Tokens used:', (_j = response.usage) === null || _j === void 0 ? void 0 : _j.total_tokens);
        console.log('[Autocomplete] Cost:', cost === null || cost === void 0 ? void 0 : cost.totalCost.toFixed(4));
        console.log(`[Autocomplete] ✅ OPENAI CALL COMPLETED: ${((endTime - startTime) / 1000).toFixed(2)}s`);
        return {
            success: true,
            data,
            tokensUsed: (_k = response.usage) === null || _k === void 0 ? void 0 : _k.total_tokens,
            model: response.model,
            cost,
            fieldStatus,
            notes,
        };
    }
    catch (error) {
        console.error('[Autocomplete] Error caught:', error);
        console.error('[Autocomplete] Error type:', (_l = error === null || error === void 0 ? void 0 : error.constructor) === null || _l === void 0 ? void 0 : _l.name);
        console.error('[Autocomplete] Error message:', error instanceof Error ? error.message : 'Unknown');
        console.error('[Autocomplete] Error stack:', error instanceof Error ? error.stack : 'No stack');
        const message = error instanceof Error ? error.message : 'Unknown error while requesting autocomplete';
        const errorDetails = {
            message,
            type: ((_m = error === null || error === void 0 ? void 0 : error.constructor) === null || _m === void 0 ? void 0 : _m.name) || typeof error,
            stack: error instanceof Error ? error.stack : undefined,
            details: error instanceof Error ? String(error) : String(error),
        };
        return { success: false, error: message, errorDetails };
    }
}
//# sourceMappingURL=autocomplete.js.map