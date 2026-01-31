import { useFormContext } from 'react-hook-form';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Button } from '@/src/components/ui/button';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { VocabularyFormValues } from './types';
import { Plus, Trash2 } from 'lucide-react';
import React from 'react';
import { useAIFieldStatus } from '@/src/hooks/useAIFieldStatus';
import { cn } from '@/src/lib/utils';

export const BaseWordForm = () => {
  const form = useFormContext<VocabularyFormValues>();
  const definitions = form.watch('definitions') || [];
  const translationAIStatus = useAIFieldStatus('translation');
  const etymologyAIStatus = useAIFieldStatus('etymology');
  const pronunciationAIStatus = useAIFieldStatus('pronunciation');
  const alternateFormAIStatus = useAIFieldStatus('alternate_form');
  const dictionaryEntryAIStatus = useAIFieldStatus('dictionary_entry');

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

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Word Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="core">Core</SelectItem>
                  <SelectItem value="non-core">Non-Core</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="translation"
        render={({ field }) => {
          return (
            <FormItem>
              <FormLabel>Translation</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  {...field}
                  className={cn(
                    translationAIStatus === 'filled' && 'bg-green-50 border-green-300 transition-colors',
                    translationAIStatus === 'missing' && 'bg-red-50 border-red-300 transition-colors',
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
          return (
            <FormItem>
              <FormLabel>Etymology</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  {...field}
                  value={field.value ?? ''}
                  className={cn(
                    etymologyAIStatus === 'filled' && 'bg-green-50 border-green-300 transition-colors',
                    etymologyAIStatus === 'missing' && 'bg-red-50 border-red-300 transition-colors',
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
          return (
            <FormItem>
              <FormLabel>Pronunciation</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  className={cn(
                    pronunciationAIStatus === 'filled' && 'bg-green-50 border-green-300 transition-colors',
                    pronunciationAIStatus === 'missing' && 'bg-red-50 border-red-300 transition-colors',
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
          return (
            <FormItem>
              <FormLabel>Alternate Form</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  className={cn(
                    alternateFormAIStatus === 'filled' && 'bg-green-50 border-green-300 transition-colors',
                    alternateFormAIStatus === 'missing' && 'bg-red-50 border-red-300 transition-colors',
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
        name="dictionary_entry"
        render={({ field }) => {
          return (
            <FormItem>
              <FormLabel>Dictionary Entry</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  placeholder="e.g., amō, amāre, amāvī, amātum"
                  className={cn(
                    dictionaryEntryAIStatus === 'filled' && 'bg-green-50 border-green-300 transition-colors',
                    dictionaryEntryAIStatus === 'missing' && 'bg-red-50 border-red-300 transition-colors',
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
