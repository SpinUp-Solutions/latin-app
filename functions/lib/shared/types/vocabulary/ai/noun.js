"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NounStructuredOutputSchema = void 0;
const zod_1 = require("zod");
const noun_1 = require("../schemas/noun");
const NounStructuredOutputBaseSchema = noun_1.NounSchema.pick({
    translation: true,
    definitions: true,
    etymology: true,
    pronunciation: true,
    alternate_form: true,
    gender: true,
    declension: true,
    declension_table: true,
    nominative_singular: true,
    genitive_singular: true,
});
exports.NounStructuredOutputSchema = NounStructuredOutputBaseSchema.extend({
    etymology: noun_1.NounSchema.shape.etymology.nullable(),
    pronunciation: noun_1.NounSchema.shape.pronunciation.nullable(),
    alternate_form: noun_1.NounSchema.shape.alternate_form.nullable(),
    gender: noun_1.NounSchema.shape.gender.nullable(),
    declension: noun_1.NounSchema.shape.declension.nullable(),
    nominative_singular: noun_1.NounSchema.shape.nominative_singular.nullable(),
    genitive_singular: noun_1.NounSchema.shape.genitive_singular.nullable(),
    notes: zod_1.z.string().min(1),
}).strict();
//# sourceMappingURL=noun.js.map