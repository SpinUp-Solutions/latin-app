import { useFormContext, type FieldPath } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { useAIFieldStatus } from '@/src/hooks/useAIFieldStatus';
import { VocabularyFormValues } from './types';
import { aiFieldHighlightClass } from './aiFieldClass';

interface AIEnumSelectProps {
  name: FieldPath<VocabularyFormValues>;
  label: string;
  placeholder: string;
  options: readonly { value: string; label: string }[];
  /** Verb conjugation treats a blank string as no selection. Other fields keep a blank string. */
  omitBlank?: boolean;
  onValueChange?: (value: string) => void;
}

export function AIEnumSelect({
  name,
  label,
  placeholder,
  options,
  omitBlank = false,
  onValueChange,
}: AIEnumSelectProps) {
  const form = useFormContext<VocabularyFormValues>();
  const aiStatus = useAIFieldStatus(name);

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => {
        const selectValue =
          typeof field.value === 'string' && (!omitBlank || field.value.trim() !== '') ? field.value : undefined;
        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Select
                value={selectValue}
                onValueChange={value => {
                  if (value && value.trim() !== '') {
                    field.onChange(value);
                    onValueChange?.(value);
                  }
                }}>
                <SelectTrigger className={aiFieldHighlightClass(aiStatus)}>
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {options.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
