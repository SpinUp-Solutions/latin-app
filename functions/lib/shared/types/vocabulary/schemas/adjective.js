"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdjectiveSchema = exports.DegreesTableSchema = void 0;
const zod_1 = require("zod");
const base_word_1 = require("./base-word");
const declension_1 = require("./declension");
const word_form_1 = require("./word-form");
exports.DegreesTableSchema = zod_1.z.object({
    positive: declension_1.AdjectiveDeclensionTableSchema,
    comparative: declension_1.AdjectiveDeclensionTableSchema,
    superlative: declension_1.AdjectiveDeclensionTableSchema,
});
exports.AdjectiveSchema = base_word_1.BaseWordSchema.extend({
    part_of_speech: zod_1.z.literal('adjective'),
    declension: declension_1.AdjectiveDeclensionSchema.nullable(),
    dictionary_forms: zod_1.z.array(word_form_1.WordFormSchema).nullable(),
    degrees_table: exports.DegreesTableSchema,
});
//# sourceMappingURL=adjective.js.map