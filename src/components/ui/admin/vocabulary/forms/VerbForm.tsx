import { useFormContext } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { Switch } from '@/src/components/ui/switch';
import { VocabularyFormValues } from './types';
import { PrincipalPartsEditor } from './PrincipalPartsEditor';
import { VerbConjugationSchema } from '@/src/types/vocabulary/schemas/enums';
import type { z } from 'zod';
import React from 'react';
import { useAIFieldStatus } from '@/src/hooks/useAIFieldStatus';
import { cn } from '@/src/lib/utils';

type VerbConjugationValue = z.infer<typeof VerbConjugationSchema>;

const conjugationValues = VerbConjugationSchema.options as readonly VerbConjugationValue[];

export const VerbForm = () => {
  const form = useFormContext<VocabularyFormValues>();
  const conjugationAIStatus = useAIFieldStatus('conjugation');
  const isDeponentAIStatus = useAIFieldStatus('is_deponent');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="conjugation"
          render={({ field }) => {
            const selectValue =
              field.value && typeof field.value === 'string' && field.value.trim() !== '' ? field.value : undefined;
            return (
              <FormItem>
                <FormLabel>Conjugation</FormLabel>
                <FormControl>
                  <Select
                    value={selectValue}
                    onValueChange={value => {
                      if (value && value.trim() !== '') {
                        field.onChange(value);
                      }
                    }}>
                    <SelectTrigger
                      className={cn(
                        conjugationAIStatus === 'filled' && 'bg-green-50 border-green-300 transition-colors',
                        conjugationAIStatus === 'missing' && 'bg-red-50 border-red-300 transition-colors',
                        'focus:bg-white'
                      )}>
                      <SelectValue placeholder="Select conjugation" />
                    </SelectTrigger>
                    <SelectContent>
                      {conjugationValues.map(value => (
                        <SelectItem key={value} value={value}>
                          {value}
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

        <FormField
          control={form.control}
          name="is_deponent"
          render={({ field }) => {
            return (
              <FormItem className="flex flex-col justify-end">
                <FormLabel>Deponent</FormLabel>
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
      </div>

      <PrincipalPartsEditor />
    </div>
  );
};
