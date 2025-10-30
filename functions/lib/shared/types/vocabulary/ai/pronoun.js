"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PronounStructuredOutputSchema = void 0;
const zod_1 = require("zod");
const pronoun_1 = require("../schemas/pronoun");
const PronounStructuredOutputBaseSchema = pronoun_1.PronounSchema.pick({
    translation: true,
    definitions: true,
    etymology: true,
    pronunciation: true,
    alternate_form: true,
    pronoun_type: true,
    declension_table: true,
});
exports.PronounStructuredOutputSchema = PronounStructuredOutputBaseSchema.extend({
    etymology: pronoun_1.PronounSchema.shape.etymology.nullable(),
    pronunciation: pronoun_1.PronounSchema.shape.pronunciation.nullable(),
    alternate_form: pronoun_1.PronounSchema.shape.alternate_form.nullable(),
    pronoun_type: pronoun_1.PronounSchema.shape.pronoun_type.nullable(),
    notes: zod_1.z.string().min(1),
}).strict();
//# sourceMappingURL=pronoun.js.map