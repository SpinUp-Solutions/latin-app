"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerbSchema = void 0;
const zod_1 = require("zod");
const base_word_1 = require("./base-word");
const verb_conjugation_1 = require("./verb-conjugation");
const word_form_1 = require("./word-form");
exports.VerbSchema = base_word_1.BaseWordSchema.extend({
    part_of_speech: zod_1.z.literal('verb'),
    conjugation: verb_conjugation_1.VerbConjugationSchema.nullable(),
    conjugation_table: verb_conjugation_1.ConjugationTableSchema,
    principal_parts: zod_1.z.array(word_form_1.WordFormSchema).min(4).max(4).nullable(),
    is_deponent: zod_1.z.boolean().nullable(),
});
//# sourceMappingURL=verb.js.map