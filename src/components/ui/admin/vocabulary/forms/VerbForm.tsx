import { useFormContext } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { Switch } from '@/src/components/ui/switch';
import { VocabularyFormValues } from './types';
import { PrincipalPartsEditor } from './PrincipalPartsEditor';

const conjugationOptions = [
  { value: '1', label: 'First' },
  { value: '2', label: 'Second' },
  { value: '3', label: 'Third' },
  { value: '3io', label: 'Third iō' },
  { value: '4', label: 'Fourth' },
];

export const VerbForm = () => {
  const form = useFormContext<VocabularyFormValues>();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="conjugation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conjugation</FormLabel>
              <FormControl>
                <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select conjugation" />
                  </SelectTrigger>
                  <SelectContent>
                    {conjugationOptions.map(option => (
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

        <FormField
          control={form.control}
          name="is_deponent"
          render={({ field }) => (
            <FormItem className="flex flex-col justify-end">
              <FormLabel>Deponent</FormLabel>
              <FormControl>
                <Switch checked={!!field.value} onCheckedChange={checked => field.onChange(checked)} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <PrincipalPartsEditor />
    </div>
  );
};
