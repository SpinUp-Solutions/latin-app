import { useFormContext } from 'react-hook-form';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Button } from '@/src/components/ui/button';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { VocabularyFormValues } from './types';
import { Plus, Trash2 } from 'lucide-react';
import React from 'react';
import { useAIFieldStatus } from '@/src/hooks/useAIFieldStatus';
import { cn } from '@/src/lib/utils';

export const BaseWordForm = () => {
  const form = useFormContext<VocabularyFormValues>();
  const definitions = form.watch('definitions') || [];

  const addDefinition = () => {
    form.setValue('definitions', [...definitions, '']);
  };

  const removeDefinition = (index: number) => {
    form.setValue(
      'definitions',
      definitions.filter((_, i) => i !== index)
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="word"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Word</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <FormLabel>Word Type</FormLabel>
          <div className="mt-2 text-sm text-gray-600">{form.getValues('type')}</div>
        </div>
      </div>

      <FormField
        control={form.control}
        name="translation"
        render={({ field }) => {
          const aiStatus = useAIFieldStatus('translation');
          return (
            <FormItem>
              <FormLabel>Translation</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  {...field}
                  className={cn(
                    aiStatus === 'filled' && 'bg-green-50 border-green-300 transition-colors',
                    aiStatus === 'missing' && 'bg-red-50 border-red-300 transition-colors',
                    'focus:bg-white'
                  )}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          );
        }}
      />

      <div className="space-y-2">
        <FormLabel>Definitions</FormLabel>
        <div className="space-y-2">
          {definitions.map((_, index) => (
            <div key={index} className="flex items-center gap-2">
              <FormField
                control={form.control}
                name={`definitions.${index}` as const}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => removeDefinition(index)}
                title="Remove definition">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="icon" onClick={addDefinition} title="Add definition">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <FormField
        control={form.control}
        name="etymology"
        render={({ field }) => {
          const aiStatus = useAIFieldStatus('etymology');
          return (
            <FormItem>
              <FormLabel>Etymology</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  {...field}
                  value={field.value ?? ''}
                  className={cn(
                    aiStatus === 'filled' && 'bg-green-50 border-green-300 transition-colors',
                    aiStatus === 'missing' && 'bg-red-50 border-red-300 transition-colors',
                    'focus:bg-white'
                  )}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          );
        }}
      />

      <FormField
        control={form.control}
        name="pronunciation"
        render={({ field }) => {
          const aiStatus = useAIFieldStatus('pronunciation');
          return (
            <FormItem>
              <FormLabel>Pronunciation</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  className={cn(
                    aiStatus === 'filled' && 'bg-green-50 border-green-300 transition-colors',
                    aiStatus === 'missing' && 'bg-red-50 border-red-300 transition-colors',
                    'focus:bg-white'
                  )}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          );
        }}
      />

      <FormField
        control={form.control}
        name="alternate_form"
        render={({ field }) => {
          const aiStatus = useAIFieldStatus('alternate_form');
          return (
            <FormItem>
              <FormLabel>Alternate Form</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  className={cn(
                    aiStatus === 'filled' && 'bg-green-50 border-green-300 transition-colors',
                    aiStatus === 'missing' && 'bg-red-50 border-red-300 transition-colors',
                    'focus:bg-white'
                  )}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          );
        }}
      />
    </div>
  );
};
