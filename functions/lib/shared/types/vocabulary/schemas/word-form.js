"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordFormSchema = void 0;
const zod_1 = require("zod");
exports.WordFormSchema = zod_1.z.object({
    full_form: zod_1.z.string().min(1),
    shortened_form: zod_1.z.string().min(1),
});
//# sourceMappingURL=word-form.js.map