"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InterjectionStructuredOutputSchema = exports.ConjunctionStructuredOutputSchema = exports.PrepositionStructuredOutputSchema = exports.AdverbStructuredOutputSchema = void 0;
const zod_1 = require("zod");
const indeclinable_words_1 = require("../schemas/indeclinable-words");
function buildIndeclinableSchema(schema) {
    return schema
        .pick({
        translation: true,
        definitions: true,
        etymology: true,
        pronunciation: true,
        alternate_form: true,
    })
        .extend({
        etymology: schema.shape.etymology.nullable(),
        pronunciation: schema.shape.pronunciation.nullable(),
        alternate_form: schema.shape.alternate_form.nullable(),
        notes: zod_1.z.string().min(1),
    })
        .strict();
}
exports.AdverbStructuredOutputSchema = buildIndeclinableSchema(indeclinable_words_1.AdverbSchema);
exports.PrepositionStructuredOutputSchema = buildIndeclinableSchema(indeclinable_words_1.PrepositionSchema);
exports.ConjunctionStructuredOutputSchema = buildIndeclinableSchema(indeclinable_words_1.ConjunctionSchema);
exports.InterjectionStructuredOutputSchema = buildIndeclinableSchema(indeclinable_words_1.InterjectionSchema);
//# sourceMappingURL=indeclinable.js.map