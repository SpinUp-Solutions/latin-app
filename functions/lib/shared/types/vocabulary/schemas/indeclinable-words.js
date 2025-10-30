"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InterjectionSchema = exports.ConjunctionSchema = exports.PrepositionSchema = exports.AdverbSchema = void 0;
const zod_1 = require("zod");
const base_word_1 = require("./base-word");
exports.AdverbSchema = base_word_1.BaseWordSchema.extend({
    part_of_speech: zod_1.z.literal('adverb'),
});
exports.PrepositionSchema = base_word_1.BaseWordSchema.extend({
    part_of_speech: zod_1.z.literal('preposition'),
});
exports.ConjunctionSchema = base_word_1.BaseWordSchema.extend({
    part_of_speech: zod_1.z.literal('conjunction'),
});
exports.InterjectionSchema = base_word_1.BaseWordSchema.extend({
    part_of_speech: zod_1.z.literal('interjection'),
});
//# sourceMappingURL=indeclinable-words.js.map