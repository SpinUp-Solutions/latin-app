import { useFormContext } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { VocabularyFormValues } from './types';
import { pronounTypeOptions } from '@/src/utils/vocabulary/formOptions';
import React from 'react';

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
              <Select
                value={field.value ?? undefined}
                onValueChange={value => {
                  if (value && value.trim() !== '') {
                    field.onChange(value);
                  }
                }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select pronoun type" />
                </SelectTrigger>
                <SelectContent>
                  {pronounTypeOptions.map(option => (
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
