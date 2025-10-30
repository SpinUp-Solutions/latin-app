"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseWordSchema = exports.FirestoreTimestampSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("./enums");
exports.FirestoreTimestampSchema = zod_1.z.string();
exports.BaseWordSchema = zod_1.z.object({
    word: zod_1.z.string().min(1),
    part_of_speech: enums_1.PartOfSpeechSchema,
    translation: zod_1.z.string().min(1),
    definitions: zod_1.z.array(zod_1.z.string().min(1)).min(1),
    etymology: zod_1.z.string().min(1).nullable(),
    pronunciation: zod_1.z.string().min(1).nullable(),
    type: enums_1.WordTypeSchema,
    alternate_form: zod_1.z.string().min(1).nullable(),
    createdAt: exports.FirestoreTimestampSchema,
    updatedAt: exports.FirestoreTimestampSchema,
});
//# sourceMappingURL=base-word.js.map