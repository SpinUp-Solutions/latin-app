import { adjectiveDeclensionOptions } from '@/src/utils/vocabulary/formOptions';
import { AIEnumSelect } from './AIEnumSelect';

export const AdjectiveForm = () => {
  return (
    <div className="space-y-6">
      <AIEnumSelect
        name="declension"
        label="Declension"
        placeholder="Select declension"
        options={adjectiveDeclensionOptions}
      />
    </div>
  );
};
