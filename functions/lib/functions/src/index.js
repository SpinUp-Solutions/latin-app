"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.autocompleteWord = void 0;
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const autocomplete_1 = require("../../shared/openai/autocomplete");
const openaiApiKey = (0, params_1.defineSecret)('OPENAI_API_KEY');
exports.autocompleteWord = (0, https_1.onCall)({
    timeoutSeconds: 540,
    memory: '1GiB',
    region: 'us-central1',
    secrets: [openaiApiKey],
}, async (request) => {
    console.log('[Firebase Function] autocompleteWord called');
    if (!request.auth) {
        console.error('[Firebase Function] Unauthenticated request');
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const data = request.data;
    if (!data.word || typeof data.word !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Word is required');
    }
    if (!data.part_of_speech || typeof data.part_of_speech !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Part of speech is required');
    }
    console.log(`[Firebase Function] Processing: word="${data.word}", part_of_speech="${data.part_of_speech}"`);
    const startTime = Date.now();
    try {
        const result = await (0, autocomplete_1.autocompleteVocabularyWord)(data);
        const endTime = Date.now();
        console.log(`[Firebase Function] Completed in ${endTime - startTime}ms`);
        console.log(`[Firebase Function] Success:`, result.success);
        return result;
    }
    catch (error) {
        const endTime = Date.now();
        console.error(`[Firebase Function] Error after ${endTime - startTime}ms:`, error);
        throw new https_1.HttpsError('internal', error instanceof Error ? error.message : 'Unknown error occurred');
    }
});
//# sourceMappingURL=index.js.map