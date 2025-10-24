import { useFormContext } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { VocabularyFormValues } from './types';
import { WordFormInput } from './WordFormInput';
import { genderOptions, nounDeclensionOptions } from '@/src/utils/vocabulary/formOptions';
import React from 'react';

export const NounForm = () => {
  const form = useFormContext<VocabularyFormValues>();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="gender"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Gender (optional)</FormLabel>
              <FormControl>
                <Select
                  value={field.value ?? undefined}
                  onValueChange={value => {
                    if (value && value.trim() !== '') {
                      field.onChange(value);
                    }
                  }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {genderOptions.map(option => (
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
          name="declension"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Declension</FormLabel>
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
                    {nounDeclensionOptions.map(option => (
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

      <div className="grid grid-cols-2 gap-4">
        <WordFormInput baseName="nominative_singular" label="Nominative Singular" />
        <WordFormInput baseName="genitive_singular" label="Genitive Singular" />
      </div>
    </div>
  );
};
