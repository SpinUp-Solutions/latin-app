"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VocabularyWordWithIdSchema = exports.VocabularyWordSchema = void 0;
const zod_1 = require("zod");
__exportStar(require("./enums"), exports);
__exportStar(require("./declension"), exports);
__exportStar(require("./verb-conjugation"), exports);
__exportStar(require("./word-form"), exports);
__exportStar(require("./base-word"), exports);
__exportStar(require("./noun"), exports);
__exportStar(require("./verb"), exports);
__exportStar(require("./pronoun"), exports);
__exportStar(require("./adjective"), exports);
__exportStar(require("./indeclinable-words"), exports);
const noun_1 = require("./noun");
const verb_1 = require("./verb");
const pronoun_1 = require("./pronoun");
const adjective_1 = require("./adjective");
const indeclinable_words_1 = require("./indeclinable-words");
exports.VocabularyWordSchema = zod_1.z.discriminatedUnion('part_of_speech', [
    noun_1.NounSchema,
    verb_1.VerbSchema,
    pronoun_1.PronounSchema,
    adjective_1.AdjectiveSchema,
    indeclinable_words_1.AdverbSchema,
    indeclinable_words_1.PrepositionSchema,
    indeclinable_words_1.ConjunctionSchema,
    indeclinable_words_1.InterjectionSchema,
]);
exports.VocabularyWordWithIdSchema = zod_1.z.union([
    noun_1.NounSchema.extend({ id: zod_1.z.string() }),
    verb_1.VerbSchema.extend({ id: zod_1.z.string() }),
    pronoun_1.PronounSchema.extend({ id: zod_1.z.string() }),
    adjective_1.AdjectiveSchema.extend({ id: zod_1.z.string() }),
    indeclinable_words_1.AdverbSchema.extend({ id: zod_1.z.string() }),
    indeclinable_words_1.PrepositionSchema.extend({ id: zod_1.z.string() }),
    indeclinable_words_1.ConjunctionSchema.extend({ id: zod_1.z.string() }),
    indeclinable_words_1.InterjectionSchema.extend({ id: zod_1.z.string() }),
]);
//# sourceMappingURL=index.js.map