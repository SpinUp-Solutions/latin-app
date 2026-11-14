import { WORD_FIELDS } from '@/src/components/ui/admin/vocabulary/wordFields';
import { WordFieldLayout } from './WordFieldLayout';
import { useFormContext } from 'react-hook-form';
import { VocabularyFormValues } from './types';
import { pronounTypeOptions, pronounPersonOptions } from '@/src/utils/vocabulary/formOptions';
import { AIEnumSelect } from './AIEnumSelect';

export const PronounForm = () => {
  const form = useFormContext<VocabularyFormValues>();
  const pronounType = form.watch('pronoun_type');

  return (
    <WordFieldLayout
      section="pronoun"
      visible={name => name !== 'person' || pronounType === 'personal'}
      renderField={name => (
        <AIEnumSelect
          name={name}
          label={WORD_FIELDS[name].label}
          placeholder={name === 'person' ? 'Select person' : 'Select pronoun type'}
          options={name === 'person' ? pronounPersonOptions : pronounTypeOptions}
          onValueChange={value => {
            if (name === 'pronoun_type' && value !== 'personal') form.setValue('person', null);
          }}
        />
      )}
    />
  );
};
