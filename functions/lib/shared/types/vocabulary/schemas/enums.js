"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupineCaseSchema = exports.GerundCaseSchema = exports.GrammaticalNumberSchema = exports.PersonSchema = exports.VoiceSchema = exports.ParticipleTenseSchema = exports.InfinitiveTenseSchema = exports.ImperativeTenseSchema = exports.SubjunctiveTenseSchema = exports.IndicativeTenseSchema = exports.VerbConjugationSchema = exports.DegreeSchema = exports.AdjectiveDeclensionSchema = exports.NounDeclensionSchema = exports.NumberSchema = exports.GenderSchema = exports.CaseSchema = exports.PronounTypeSchema = exports.WordTypeSchema = exports.PartOfSpeechSchema = void 0;
const zod_1 = require("zod");
exports.PartOfSpeechSchema = zod_1.z.enum([
    'noun',
    'verb',
    'pronoun',
    'adjective',
    'adverb',
    'preposition',
    'conjunction',
    'interjection',
]);
exports.WordTypeSchema = zod_1.z.enum(['core']);
exports.PronounTypeSchema = zod_1.z.enum([
    'personal',
    'reflexive',
    'possessive',
    'demonstrative',
    'intensive',
    'relative',
    'interrogative',
    'indefinite',
]);
exports.CaseSchema = zod_1.z.enum([
    'nominative',
    'genitive',
    'dative',
    'accusative',
    'ablative',
    'vocative',
    'locative',
]);
exports.GenderSchema = zod_1.z.enum(['masculine', 'feminine', 'neuter']);
exports.NumberSchema = zod_1.z.enum(['singular', 'plural']);
exports.NounDeclensionSchema = zod_1.z.enum(['1', '2', '3', '3-istem', '4', '5']);
exports.AdjectiveDeclensionSchema = zod_1.z.enum(['1-2', '3']);
exports.DegreeSchema = zod_1.z.enum(['positive', 'comparative', 'superlative']);
exports.VerbConjugationSchema = zod_1.z.enum(['1', '2', '3', '3io', '4']);
exports.IndicativeTenseSchema = zod_1.z.enum([
    'present',
    'imperfect',
    'future',
    'perfect',
    'pluperfect',
    'future_perfect',
]);
exports.SubjunctiveTenseSchema = zod_1.z.enum(['present', 'imperfect', 'perfect', 'pluperfect']);
exports.ImperativeTenseSchema = zod_1.z.enum(['present', 'future']);
exports.InfinitiveTenseSchema = zod_1.z.enum(['present', 'perfect', 'future']);
exports.ParticipleTenseSchema = zod_1.z.enum(['present', 'perfect', 'future']);
exports.VoiceSchema = zod_1.z.enum(['active', 'passive']);
exports.PersonSchema = zod_1.z.enum(['first', 'second', 'third']);
exports.GrammaticalNumberSchema = zod_1.z.enum(['singular', 'plural']);
exports.GerundCaseSchema = zod_1.z.enum(['genitive', 'dative', 'accusative', 'ablative']);
exports.SupineCaseSchema = zod_1.z.enum(['accusative', 'ablative']);
//# sourceMappingURL=enums.js.map