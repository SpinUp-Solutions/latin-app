import { useFormContext } from 'react-hook-form';
import { Input } from '@/src/components/ui/input';
import { Button } from '@/src/components/ui/button';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/src/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { VocabularyFormValues } from './types';
import { Plus, Trash2 } from 'lucide-react';
import { AITextField } from './AITextField';

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

      <AITextField name="translation" label="Translation" multiline />

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

      <AITextField name="etymology" label="Etymology" multiline />

      <AITextField name="pronunciation" label="Pronunciation" />

      <AITextField name="alternate_form" label="Alternate Form" />

      <AITextField name="dictionary_entry" label="Dictionary Entry" placeholder="e.g., amō, amāre, amāvī, amātum" />
    </div>
  );
};
