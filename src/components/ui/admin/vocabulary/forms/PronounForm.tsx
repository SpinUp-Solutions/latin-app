import { useFormContext } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { VocabularyFormValues } from './types';
import { pronounTypeOptions } from '@/src/utils/vocabulary/formOptions';
import React from 'react';
import { useAIFieldStatus } from '@/src/hooks/useAIFieldStatus';
import { cn } from '@/src/lib/utils';

export const PronounForm = () => {
  const form = useFormContext<VocabularyFormValues>();
  const pronounTypeAIStatus = useAIFieldStatus('pronoun_type');

  return (
    <div className="space-y-6">
      <FormField
        control={form.control}
        name="pronoun_type"
        render={({ field }) => {
          return (
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
                  <SelectTrigger
                    className={cn(
                      pronounTypeAIStatus === 'filled' && 'bg-green-50 border-green-300 transition-colors',
                      pronounTypeAIStatus === 'missing' && 'bg-red-50 border-red-300 transition-colors',
                      'focus:bg-white'
                    )}>
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
          );
        }}
      />
    </div>
  );
};
