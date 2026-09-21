import { useFormContext } from 'react-hook-form';
import { VocabularyFormValues } from './types';
import { pronounTypeOptions, pronounPersonOptions } from '@/src/utils/vocabulary/formOptions';
import { AIEnumSelect } from './AIEnumSelect';

export const PronounForm = () => {
  const form = useFormContext<VocabularyFormValues>();
  const pronounType = form.watch('pronoun_type');

  return (
    <div className="space-y-6">
      <AIEnumSelect
        name="pronoun_type"
        label="Pronoun Type"
        placeholder="Select pronoun type"
        options={pronounTypeOptions}
        onValueChange={value => {
          if (value !== 'personal') {
            form.setValue('person', null);
          }
        }}
      />

      {pronounType === 'personal' && (
        <AIEnumSelect name="person" label="Person" placeholder="Select person" options={pronounPersonOptions} />
      )}
    </div>
  );
};
