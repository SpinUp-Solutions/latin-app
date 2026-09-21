import { useFormContext, type FieldPath } from 'react-hook-form';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { useAIFieldStatus } from '@/src/hooks/useAIFieldStatus';
import { VocabularyFormValues } from './types';
import { aiFieldHighlightClass } from './aiFieldClass';

interface AITextFieldProps {
  name: FieldPath<VocabularyFormValues>;
  label: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  labelClassName?: string;
  /** Status key when it differs from the input path, such as a shared noun stem field. */
  aiField?: string;
}

export function AITextField({
  name,
  label,
  multiline = false,
  rows = 2,
  placeholder,
  labelClassName,
  aiField,
}: AITextFieldProps) {
  const form = useFormContext<VocabularyFormValues>();
  const aiStatus = useAIFieldStatus(aiField ?? name);

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => {
        const className = aiFieldHighlightClass(aiStatus);
        const value = typeof field.value === 'string' ? field.value : '';
        return (
          <FormItem>
            <FormLabel className={labelClassName}>{label}</FormLabel>
            <FormControl>
              {multiline ? (
                <Textarea rows={rows} {...field} value={value} placeholder={placeholder} className={className} />
              ) : (
                <Input {...field} value={value} placeholder={placeholder} className={className} />
              )}
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
