"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdjectiveStructuredOutputSchema = void 0;
const zod_1 = require("zod");
const adjective_1 = require("../schemas/adjective");
const AdjectiveStructuredOutputBaseSchema = adjective_1.AdjectiveSchema.pick({
    translation: true,
    definitions: true,
    etymology: true,
    pronunciation: true,
    alternate_form: true,
    declension: true,
    dictionary_forms: true,
    degrees_table: true,
});
exports.AdjectiveStructuredOutputSchema = AdjectiveStructuredOutputBaseSchema.extend({
    etymology: adjective_1.AdjectiveSchema.shape.etymology.nullable(),
    pronunciation: adjective_1.AdjectiveSchema.shape.pronunciation.nullable(),
    alternate_form: adjective_1.AdjectiveSchema.shape.alternate_form.nullable(),
    declension: adjective_1.AdjectiveSchema.shape.declension.nullable(),
    dictionary_forms: adjective_1.AdjectiveSchema.shape.dictionary_forms.nullable(),
    notes: zod_1.z.string().min(1),
}).strict();
//# sourceMappingURL=adjective.js.map