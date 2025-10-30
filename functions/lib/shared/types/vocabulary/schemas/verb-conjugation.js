"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupineCaseSchema = exports.GerundCaseSchema = exports.GrammaticalNumberSchema = exports.PersonSchema = exports.VoiceSchema = exports.ParticipleTenseSchema = exports.InfinitiveTenseSchema = exports.ImperativeTenseSchema = exports.SubjunctiveTenseSchema = exports.IndicativeTenseSchema = exports.VerbConjugationSchema = exports.ConjugationTableSchema = exports.SupineTableSchema = exports.GerundTableSchema = exports.ParticipleTableSchema = exports.InfinitiveTableSchema = exports.InfinitiveVoiceSchema = exports.ImperativeTableSchema = exports.FutureImperativePassiveFormsSchema = exports.FutureImperativeActiveFormsSchema = exports.PresentImperativeFormsSchema = exports.SubjunctiveVoiceSchema = exports.IndicativeVoiceSchema = exports.VerbNumberFormsSchema = exports.VerbPersonFormsSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("./enums");
Object.defineProperty(exports, "VerbConjugationSchema", { enumerable: true, get: function () { return enums_1.VerbConjugationSchema; } });
Object.defineProperty(exports, "IndicativeTenseSchema", { enumerable: true, get: function () { return enums_1.IndicativeTenseSchema; } });
Object.defineProperty(exports, "SubjunctiveTenseSchema", { enumerable: true, get: function () { return enums_1.SubjunctiveTenseSchema; } });
Object.defineProperty(exports, "ImperativeTenseSchema", { enumerable: true, get: function () { return enums_1.ImperativeTenseSchema; } });
Object.defineProperty(exports, "InfinitiveTenseSchema", { enumerable: true, get: function () { return enums_1.InfinitiveTenseSchema; } });
Object.defineProperty(exports, "ParticipleTenseSchema", { enumerable: true, get: function () { return enums_1.ParticipleTenseSchema; } });
Object.defineProperty(exports, "VoiceSchema", { enumerable: true, get: function () { return enums_1.VoiceSchema; } });
Object.defineProperty(exports, "PersonSchema", { enumerable: true, get: function () { return enums_1.PersonSchema; } });
Object.defineProperty(exports, "GrammaticalNumberSchema", { enumerable: true, get: function () { return enums_1.GrammaticalNumberSchema; } });
Object.defineProperty(exports, "GerundCaseSchema", { enumerable: true, get: function () { return enums_1.GerundCaseSchema; } });
Object.defineProperty(exports, "SupineCaseSchema", { enumerable: true, get: function () { return enums_1.SupineCaseSchema; } });
const declension_1 = require("./declension");
exports.VerbPersonFormsSchema = zod_1.z.object({
    first: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    second: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    third: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
});
exports.VerbNumberFormsSchema = zod_1.z.object({
    singular: exports.VerbPersonFormsSchema,
    plural: exports.VerbPersonFormsSchema,
});
exports.IndicativeVoiceSchema = zod_1.z.object({
    present: exports.VerbNumberFormsSchema,
    imperfect: exports.VerbNumberFormsSchema,
    future: exports.VerbNumberFormsSchema,
    perfect: exports.VerbNumberFormsSchema,
    pluperfect: exports.VerbNumberFormsSchema,
    future_perfect: exports.VerbNumberFormsSchema,
});
exports.SubjunctiveVoiceSchema = zod_1.z.object({
    present: exports.VerbNumberFormsSchema,
    imperfect: exports.VerbNumberFormsSchema,
    perfect: exports.VerbNumberFormsSchema,
    pluperfect: exports.VerbNumberFormsSchema,
});
exports.PresentImperativeFormsSchema = zod_1.z.object({
    singular: zod_1.z.object({
        second: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    }),
    plural: zod_1.z.object({
        second: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    }),
});
exports.FutureImperativeActiveFormsSchema = zod_1.z.object({
    singular: zod_1.z.object({
        second: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
        third: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    }),
    plural: zod_1.z.object({
        second: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
        third: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    }),
});
exports.FutureImperativePassiveFormsSchema = zod_1.z.object({
    singular: zod_1.z.object({
        third: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    }),
    plural: zod_1.z.object({
        third: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    }),
});
exports.ImperativeTableSchema = zod_1.z.object({
    active: zod_1.z.object({
        present: exports.PresentImperativeFormsSchema,
        future: exports.FutureImperativeActiveFormsSchema,
    }),
    passive: zod_1.z.object({
        present: exports.PresentImperativeFormsSchema,
        future: exports.FutureImperativePassiveFormsSchema,
    }),
});
exports.InfinitiveVoiceSchema = zod_1.z.object({
    active: zod_1.z.string().min(1).nullable(),
    passive: zod_1.z.string().min(1).nullable(),
});
exports.InfinitiveTableSchema = zod_1.z.object({
    present: exports.InfinitiveVoiceSchema,
    perfect: exports.InfinitiveVoiceSchema,
    future: exports.InfinitiveVoiceSchema,
});
exports.ParticipleTableSchema = zod_1.z.object({
    present: zod_1.z.object({
        active: declension_1.AdjectiveDeclensionTableSchema.nullable(),
    }),
    perfect: zod_1.z.object({
        passive: declension_1.AdjectiveDeclensionTableSchema.nullable(),
    }),
    future: zod_1.z.object({
        active: declension_1.AdjectiveDeclensionTableSchema.nullable(),
        passive: declension_1.AdjectiveDeclensionTableSchema.nullable(),
    }),
});
exports.GerundTableSchema = zod_1.z.object({
    genitive: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    dative: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    accusative: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    ablative: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
});
exports.SupineTableSchema = zod_1.z.object({
    accusative: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    ablative: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
});
exports.ConjugationTableSchema = zod_1.z.object({
    indicative: zod_1.z.object({
        active: exports.IndicativeVoiceSchema,
        passive: exports.IndicativeVoiceSchema,
    }),
    subjunctive: zod_1.z.object({
        active: exports.SubjunctiveVoiceSchema,
        passive: exports.SubjunctiveVoiceSchema,
    }),
    imperative: exports.ImperativeTableSchema,
    nonFinite: zod_1.z.object({
        infinitive: exports.InfinitiveTableSchema,
        participle: exports.ParticipleTableSchema,
    }),
    gerund: exports.GerundTableSchema,
    supine: exports.SupineTableSchema,
});
//# sourceMappingURL=verb-conjugation.js.map