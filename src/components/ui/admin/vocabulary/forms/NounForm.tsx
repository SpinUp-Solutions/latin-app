import { useFormContext } from 'react-hook-form';
import { genderOptions, nounDeclensionOptions } from '@/src/utils/vocabulary/formOptions';
import { WORD_FIELDS } from '@/src/components/ui/admin/vocabulary/wordFields';
import { WordFieldLayout } from './WordFieldLayout';
import { AIEnumSelect } from './AIEnumSelect';
import { WordFormInput } from './WordFormInput';
import { IndeclinableTableWarning } from './IndeclinableTableWarning';
import type { VocabularyFormValues } from './types';

export const NounForm = ({ table }: { table?: unknown }) => {
  const form = useFormContext<VocabularyFormValues>();
  const declension = form.watch('declension');

  return (
    <div className="space-y-4">
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
      <IndeclinableTableWarning partOfSpeech="noun" declension={declension} table={table} />
    </div>
  );
};
