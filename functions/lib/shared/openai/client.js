"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_TOKENS = exports.DEFAULT_TEMPERATURE = exports.DEFAULT_MODEL = exports.openai = void 0;
const openai_1 = __importDefault(require("openai"));
exports.openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
exports.DEFAULT_MODEL = 'gpt-5-mini';
exports.DEFAULT_TEMPERATURE = 0.2;
exports.MAX_TOKENS = 16000;
//# sourceMappingURL=client.js.map