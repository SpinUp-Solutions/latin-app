import { useFormContext, useFieldArray } from 'react-hook-form';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { VocabularyFormValues } from './types';
import { Plus, Trash2 } from 'lucide-react';
import React from 'react';

export const PrincipalPartsEditor = () => {
  const form = useFormContext<VocabularyFormValues>();
  const parts = useFieldArray({ control: form.control, name: 'principal_parts' });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FormLabel>Principal Parts</FormLabel>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => parts.append({ full_form: '', shortened_form: '' })}
          title="Add principal part">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-3">
        {parts.fields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-5 gap-2 items-end">
            <FormField
              control={form.control}
              name={`principal_parts.${index}.full_form` as const}
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel className="text-xs">Full Form</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`principal_parts.${index}.shortened_form` as const}
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel className="text-xs">Shortened Form</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="button" variant="outline" size="icon" onClick={() => parts.remove(index)} title="Remove principal part">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {parts.fields.length === 0 && <div className="text-sm text-gray-500">No principal parts added.</div>}
      </div>
    </div>
  );
};
