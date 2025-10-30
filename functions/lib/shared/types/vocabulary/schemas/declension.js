"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdjectiveDeclensionSchema = exports.NounDeclensionSchema = exports.NumberSchema = exports.GenderSchema = exports.CaseSchema = exports.AdjectiveDeclensionTableRowSchema = exports.DeclensionTableRowSchema = exports.AdjectiveDeclensionTableSchema = exports.DeclensionTableSchema = exports.GenderFormsSchema = exports.DeclensionNumberFormsSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("./enums");
Object.defineProperty(exports, "CaseSchema", { enumerable: true, get: function () { return enums_1.CaseSchema; } });
Object.defineProperty(exports, "GenderSchema", { enumerable: true, get: function () { return enums_1.GenderSchema; } });
Object.defineProperty(exports, "NumberSchema", { enumerable: true, get: function () { return enums_1.NumberSchema; } });
Object.defineProperty(exports, "NounDeclensionSchema", { enumerable: true, get: function () { return enums_1.NounDeclensionSchema; } });
Object.defineProperty(exports, "AdjectiveDeclensionSchema", { enumerable: true, get: function () { return enums_1.AdjectiveDeclensionSchema; } });
exports.DeclensionNumberFormsSchema = zod_1.z.object({
    singular: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    plural: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
});
exports.GenderFormsSchema = zod_1.z.object({
    masculine: exports.DeclensionNumberFormsSchema,
    feminine: exports.DeclensionNumberFormsSchema,
    neuter: exports.DeclensionNumberFormsSchema,
});
exports.DeclensionTableSchema = zod_1.z.object({
    nominative: zod_1.z.object({
        singular: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
        plural: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    }),
    genitive: zod_1.z.object({
        singular: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
        plural: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    }),
    dative: zod_1.z.object({
        singular: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
        plural: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    }),
    accusative: zod_1.z.object({
        singular: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
        plural: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    }),
    ablative: zod_1.z.object({
        singular: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
        plural: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    }),
    vocative: zod_1.z.object({
        singular: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
        plural: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    }),
    locative: zod_1.z.object({
        singular: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
        plural: zod_1.z.array(zod_1.z.string().min(1)).min(1).nullable(),
    }),
});
exports.AdjectiveDeclensionTableSchema = zod_1.z.object({
    nominative: exports.GenderFormsSchema,
    genitive: exports.GenderFormsSchema,
    dative: exports.GenderFormsSchema,
    accusative: exports.GenderFormsSchema,
    ablative: exports.GenderFormsSchema,
    vocative: exports.GenderFormsSchema,
    locative: exports.GenderFormsSchema,
});
exports.DeclensionTableRowSchema = zod_1.z.object({
    case: enums_1.CaseSchema,
    singular: zod_1.z.array(zod_1.z.string()),
    plural: zod_1.z.array(zod_1.z.string()),
});
exports.AdjectiveDeclensionTableRowSchema = zod_1.z.object({
    case: enums_1.CaseSchema,
    masculine: exports.DeclensionNumberFormsSchema,
    feminine: exports.DeclensionNumberFormsSchema,
    neuter: exports.DeclensionNumberFormsSchema,
});
//# sourceMappingURL=declension.js.map