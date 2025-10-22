import { useFormContext } from 'react-hook-form';
import { Input } from '@/src/components/ui/input';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { VocabularyFormValues } from './types';

interface WordFormInputProps {
  baseName: 'nominative_singular' | 'genitive_singular';
  label: string;
}

export const WordFormInput = ({ baseName, label }: WordFormInputProps) => {
  const form = useFormContext<VocabularyFormValues>();

  return (
    <div className="space-y-2">
      <FormLabel>{label}</FormLabel>
      <div className="grid grid-cols-2 gap-2">
        <FormField
          control={form.control}
          name={`${baseName}.full_form` as const}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Full Form</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`${baseName}.shortened_form` as const}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Shortened Form</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
};
