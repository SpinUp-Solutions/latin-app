import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { VocabularyFormValues } from './types';

export const PrepositionForm = () => {
  const form = useFormContext<VocabularyFormValues>();

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="case"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Case</FormLabel>
            <Select onValueChange={field.onChange} value={field.value || undefined}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select case" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="accusative">Accusative</SelectItem>
                <SelectItem value="ablative">Ablative</SelectItem>
                <SelectItem value="both">Accusative + Ablative (Both)</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};
