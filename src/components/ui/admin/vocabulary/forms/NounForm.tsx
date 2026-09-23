import { genderOptions, nounDeclensionOptions } from '@/src/utils/vocabulary/formOptions';
import { AIEnumSelect } from './AIEnumSelect';
import { WordFormInput } from './WordFormInput';

export const NounForm = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <AIEnumSelect name="gender" label="Gender (optional)" placeholder="Select gender" options={genderOptions} />
        <AIEnumSelect
          name="declension"
          label="Declension"
          placeholder="Select declension"
          options={nounDeclensionOptions}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <WordFormInput baseName="nominative_singular" label="Nominative Singular" />
        <WordFormInput baseName="genitive_singular" label="Genitive Singular" />
      </div>
    </div>
  );
};
