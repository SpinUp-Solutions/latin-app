"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerbStructuredOutputSchema = void 0;
const zod_1 = require("zod");
const schemas_1 = require("../schemas");
const VerbStructuredOutputBaseSchema = schemas_1.VerbSchema.pick({
    translation: true,
    definitions: true,
    etymology: true,
    pronunciation: true,
    alternate_form: true,
    conjugation: true,
    conjugation_table: true,
    principal_parts: true,
    is_deponent: true,
}).extend({
    notes: zod_1.z.string().min(1),
});
exports.VerbStructuredOutputSchema = VerbStructuredOutputBaseSchema.strict();
//# sourceMappingURL=verb.js.map