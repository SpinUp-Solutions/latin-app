import { WORD_FIELDS } from '@/src/components/ui/admin/vocabulary/wordFields';
import { adjectiveDeclensionOptions } from '@/src/utils/vocabulary/formOptions';
import { AIEnumSelect } from './AIEnumSelect';

export const AdjectiveForm = () => {
  return (
    <div className="space-y-6">
      <AIEnumSelect
        name="declension"
        label={WORD_FIELDS.declension.label}
        placeholder="Select declension"
        options={adjectiveDeclensionOptions}
      />
    </div>
  );
};
