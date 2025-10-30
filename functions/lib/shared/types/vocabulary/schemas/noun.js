"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NounSchema = void 0;
const zod_1 = require("zod");
const base_word_1 = require("./base-word");
const declension_1 = require("./declension");
const word_form_1 = require("./word-form");
exports.NounSchema = base_word_1.BaseWordSchema.extend({
    part_of_speech: zod_1.z.literal('noun'),
    gender: declension_1.GenderSchema.nullable(),
    declension: declension_1.NounDeclensionSchema.nullable(),
    declension_table: declension_1.DeclensionTableSchema,
    nominative_singular: word_form_1.WordFormSchema.nullable(),
    genitive_singular: word_form_1.WordFormSchema.nullable(),
});
//# sourceMappingURL=noun.js.map