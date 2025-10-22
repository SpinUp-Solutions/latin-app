import { useFormContext } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { Switch } from '@/src/components/ui/switch';
import { VocabularyFormValues } from './types';
import { PrincipalPartsEditor } from './PrincipalPartsEditor';
import { VerbConjugationSchema } from '@/src/types/vocabulary/schemas/enums';
import type { z } from 'zod';
import React from 'react';

type VerbConjugationValue = z.infer<typeof VerbConjugationSchema>;

const conjugationValues = VerbConjugationSchema.options as readonly VerbConjugationValue[];

export const VerbForm = () => {
  const form = useFormContext<VocabularyFormValues>();

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
                    <SelectTrigger>
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
