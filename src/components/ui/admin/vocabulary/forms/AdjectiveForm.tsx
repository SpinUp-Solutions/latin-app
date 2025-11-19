import { useFormContext } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { VocabularyFormValues } from './types';
import { adjectiveDeclensionOptions } from '@/src/utils/vocabulary/formOptions';
import React from 'react';

export const AdjectiveForm = () => {
  const form = useFormContext<VocabularyFormValues>();

  return (
    <div className="space-y-6">
      <FormField
        control={form.control}
        name="declension"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Declension (optional)</FormLabel>
            <FormControl>
              <Select
                value={field.value ?? undefined}
                onValueChange={value => {
                  if (value && value.trim() !== '') {
                    field.onChange(value);
                  }
                }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select declension" />
                </SelectTrigger>
                <SelectContent>
                  {adjectiveDeclensionOptions.map(option => (
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
