import { genderOptions, nounDeclensionOptions } from '@/src/utils/vocabulary/formOptions';
import { WORD_FIELDS } from '@/src/components/ui/admin/vocabulary/wordFields';
import { WordFieldLayout } from './WordFieldLayout';
import { AIEnumSelect } from './AIEnumSelect';
import { WordFormInput } from './WordFormInput';

export const NounForm = () => (
  <WordFieldLayout
    section="noun"
    renderField={name => {
      const { label } = WORD_FIELDS[name];
      if (name === 'nominative_singular' || name === 'genitive_singular') {
        return <WordFormInput baseName={name} label={label} />;
      }
      return (
        <AIEnumSelect
          name={name}
          label={label}
          placeholder={name === 'gender' ? 'Select gender' : 'Select declension'}
          options={name === 'gender' ? genderOptions : nounDeclensionOptions}
        />
      );
    }}
  />
);
