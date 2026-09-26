import { FormLabel } from '@/src/components/ui/form';
import { AITextField } from './AITextField';

interface WordFormInputProps {
  baseName: 'nominative_singular' | 'genitive_singular';
  label: string;
}

export const WordFormInput = ({ baseName, label }: WordFormInputProps) => {
  return (
    <div className="space-y-2">
      <FormLabel>{label}</FormLabel>
      <div className="grid grid-cols-2 gap-2">
        <AITextField name={`${baseName}.full_form`} label="Full Form" labelClassName="text-xs" aiField={baseName} />
        <AITextField
          name={`${baseName}.shortened_form`}
          label="Shortened Form"
          labelClassName="text-xs"
          aiField={baseName}
        />
      </div>
    </div>
  );
};
