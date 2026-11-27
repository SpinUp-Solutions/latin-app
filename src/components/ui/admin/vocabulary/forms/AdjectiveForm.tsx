import { useFormContext } from 'react-hook-form';
import { WORD_FIELDS } from '@/src/components/ui/admin/vocabulary/wordFields';
import { adjectiveDeclensionOptions } from '@/src/utils/vocabulary/formOptions';
import { AIEnumSelect } from './AIEnumSelect';
import { AIFieldReview } from '../VocabularyAIReview';
import { IndeclinableTableWarning } from './IndeclinableTableWarning';
import type { VocabularyFormValues } from './types';

export const AdjectiveForm = ({ table }: { table?: unknown }) => {
  const form = useFormContext<VocabularyFormValues>();
  const declension = form.watch('declension');

  return (
    <div className="space-y-4">
      <AIFieldReview field="declension">
        <AIEnumSelect
          name="declension"
          label={WORD_FIELDS.declension.label}
          placeholder="Select declension"
          options={adjectiveDeclensionOptions}
        />
      </AIFieldReview>
      <IndeclinableTableWarning partOfSpeech="adjective" declension={declension} table={table} />
    </div>
  );
};
