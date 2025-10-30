"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PronounSchema = void 0;
const zod_1 = require("zod");
const base_word_1 = require("./base-word");
const declension_1 = require("./declension");
const enums_1 = require("./enums");
exports.PronounSchema = base_word_1.BaseWordSchema.extend({
    part_of_speech: zod_1.z.literal('pronoun'),
    pronoun_type: enums_1.PronounTypeSchema.nullable(),
    declension_table: declension_1.DeclensionTableSchema,
});
//# sourceMappingURL=pronoun.js.map