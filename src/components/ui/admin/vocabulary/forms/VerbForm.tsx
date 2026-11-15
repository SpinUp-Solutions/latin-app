import { WORD_FIELDS } from '@/src/components/ui/admin/vocabulary/wordFields';
import { WordFieldLayout } from './WordFieldLayout';
import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { Switch } from '@/src/components/ui/switch';
import { VocabularyFormValues } from './types';
import { PrincipalPartsEditor } from './PrincipalPartsEditor';
import { VerbConjugationSchema } from '@/shared/types/vocabulary/schemas/enums';
import type { z } from 'zod';
import { useAIFieldStatus } from '@/src/hooks/useAIFieldStatus';
import { cn } from '@/src/lib/utils';
import { AIEnumSelect } from './AIEnumSelect';

type VerbConjugationValue = z.infer<typeof VerbConjugationSchema>;

const conjugationValues = VerbConjugationSchema.options as readonly VerbConjugationValue[];
const conjugationOptions = conjugationValues.map(value => ({ value, label: value }));

export const VerbForm = () => {
  const form = useFormContext<VocabularyFormValues>();
  const isDeponentAIStatus = useAIFieldStatus('is_deponent');

  return (
    <WordFieldLayout
      section="verb"
      renderField={name => {
        const { label } = WORD_FIELDS[name];
        if (name === 'principal_parts') return <PrincipalPartsEditor />;
        if (name === 'conjugation')
          return (
            <AIEnumSelect
              name={name}
              label={label}
              placeholder="Select conjugation"
              options={conjugationOptions}
              omitBlank
            />
          );
        return (
          <FormField
            control={form.control}
            name="is_deponent"
            render={({ field }) => {
              return (
                <FormItem className="flex flex-col justify-end">
                  <FormLabel>{label}</FormLabel>
                  <FormControl>
                    <div
                      className={cn(
                        'inline-block p-2 rounded transition-colors',
                        isDeponentAIStatus === 'filled' && 'bg-green-50 border border-green-300',
                        isDeponentAIStatus === 'missing' && 'bg-red-50 border border-red-300'
                      )}>
                      <Switch checked={!!field.value} onCheckedChange={checked => field.onChange(checked)} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        );
      }}
    />
  );
};
