import { useFormContext } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { VocabularyFormValues } from './types';

const pronounOptions = [
  { value: 'personal', label: 'Personal' },
  { value: 'reflexive', label: 'Reflexive' },
  { value: 'possessive', label: 'Possessive' },
  { value: 'demonstrative', label: 'Demonstrative' },
  { value: 'intensive', label: 'Intensive' },
  { value: 'relative', label: 'Relative' },
  { value: 'interrogative', label: 'Interrogative' },
  { value: 'indefinite', label: 'Indefinite' },
];

export const PronounForm = () => {
  const form = useFormContext<VocabularyFormValues>();

  return (
    <div className="space-y-6">
      <FormField
        control={form.control}
        name="pronoun_type"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Pronoun Type</FormLabel>
            <FormControl>
              <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select pronoun type" />
                </SelectTrigger>
                <SelectContent>
                  {pronounOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};
