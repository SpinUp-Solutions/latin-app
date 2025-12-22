import {
  GenderSchema,
  NounDeclensionSchema,
  AdjectiveDeclensionSchema,
  PronounTypeSchema,
  PronounPersonSchema,
} from '@/shared/types/vocabulary/schemas/enums';
import { formatEnumLabel } from '@/src/utils/schema-helpers';

export const genderOptions = GenderSchema.options.map(value => ({
  value,
  label: formatEnumLabel(value),
}));

export const nounDeclensionOptions = NounDeclensionSchema.options.map(value => ({
  value,
  label: formatEnumLabel(value),
}));

export const adjectiveDeclensionOptions = AdjectiveDeclensionSchema.options.map(value => ({
  value,
  label: formatEnumLabel(value),
}));

export const pronounTypeOptions = PronounTypeSchema.options.map(value => ({
  value,
  label: formatEnumLabel(value),
}));

export const pronounPersonOptions = PronounPersonSchema.options.map(value => ({
  value,
  label: formatEnumLabel(value),
}));
