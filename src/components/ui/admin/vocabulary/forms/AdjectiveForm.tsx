import { WORD_FIELDS } from '@/src/components/ui/admin/vocabulary/wordFields';
import { adjectiveDeclensionOptions } from '@/src/utils/vocabulary/formOptions';
import { AIEnumSelect } from './AIEnumSelect';
import { AIFieldReview } from '../VocabularyAIReview';

export const AdjectiveForm = () => {
  return (
    <div className="space-y-6">
      <AIFieldReview field="declension">
        <AIEnumSelect
          name="declension"
          label={WORD_FIELDS.declension.label}
          placeholder="Select declension"
          options={adjectiveDeclensionOptions}
        />
      </AIFieldReview>
    </div>
  );
};
