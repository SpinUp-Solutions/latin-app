import React, { useState, useEffect, useMemo } from 'react';
import { EditorContent } from '@tiptap/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Badge } from '@/src/components/ui/badge';
import { Checkbox } from '@/src/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Alert, AlertDescription } from '@/src/components/ui/alert';
import { X, Plus, Search, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { SimpleInput, SimpleTextarea, SimpleSelect } from '@/src/components/ui/form-components';
import { TooltipData, TooltipFormData } from '@/src/types/tooltip';
import { WordLookupService, WordLookupResult } from '@/src/services/wordLookupService';
import { transformToFormData, cleanFormData, getEmptyFormData, WORD_DATA_FIELDS } from '@/src/utils/tooltipUtils';
import { useTipTapEditor } from '@/src/hooks/useTipTapEditor';
import { getSimpleExtensions } from '@/src/utils/tiptapExtensions';
import { cn } from '@/src/lib/utils';

const extractPath = (url: string): string => {
  if (!url.trim()) return '';
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname;
  } catch {
    return url.startsWith('/') ? url : `/${url}`;
  }
};

const MiniRichEditor: React.FC<{
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}> = ({ content, onChange, placeholder }) => {
  const extensions = useMemo(() => getSimpleExtensions({ enableTooltips: false }), []);
  const editor = useTipTapEditor({
    extensions,
    initialContent: content,
    onUpdate: (_editor, html) => onChange(html),
  });

  if (!editor)
    return (
      <div className="h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm opacity-50">
        Loading...
      </div>
    );

  return (
    <div className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <EditorContent
        editor={editor}
        className={cn(
          'w-full',
          '[&_.ProseMirror]:w-full [&_.ProseMirror]:outline-none [&_.ProseMirror]:border-none',
          '[&_.ProseMirror]:bg-transparent [&_.ProseMirror]:resize-none [&_.ProseMirror]:text-sm',
          '[&_.ProseMirror]:m-0 [&_.ProseMirror]:p-0',
          placeholder &&
            !content &&
            `[&_.ProseMirror]:empty:before:content-['${placeholder}'] [&_.ProseMirror]:empty:before:text-muted-foreground [&_.ProseMirror]:empty:before:pointer-events-none`
        )}
      />
    </div>
  );
};

interface SearchState {
  isSearching: boolean;
  searchResult: WordLookupResult | null;
  hasSearched: boolean;
}

interface TooltipEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TooltipFormData) => void;
  onRemove?: () => void;
  initialData?: TooltipData | null;
  selectedText?: string;
}

const getPopulatedFieldKeys = (formData: TooltipFormData): string[] => {
  return WORD_DATA_FIELDS.map(f => f.key).filter(key => {
    const val = formData[key as keyof TooltipFormData];
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'string') return val.trim().length > 0;
    return !!val;
  });
};

export const TooltipEditorDialog: React.FC<TooltipEditorDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  onRemove,
  initialData = null,
  selectedText = '',
}) => {
  const [formData, setFormData] = useState<TooltipFormData>(transformToFormData(initialData, selectedText));
  const [visibleFields, setVisibleFields] = useState<string[]>([]);
  const [hasWordData, setHasWordData] = useState(false);
  const [newExample, setNewExample] = useState('');
  const [newChip, setNewChip] = useState('');
  const [searchState, setSearchState] = useState<SearchState>({
    isSearching: false,
    searchResult: null,
    hasSearched: false,
  });
  const [mode, setMode] = useState<'custom' | 'word-lookup'>('custom');

  useEffect(() => {
    const data = transformToFormData(initialData, selectedText);
    setFormData(data);

    const existingHasWord = !!initialData && !!(initialData.word || initialData.translation);
    setHasWordData(existingHasWord);
    setMode(existingHasWord ? 'word-lookup' : 'custom');

    if (initialData?.visibleFields) {
      setVisibleFields(initialData.visibleFields);
    } else if (existingHasWord) {
      setVisibleFields(getPopulatedFieldKeys(data));
    } else {
      setVisibleFields([]);
    }

    setSearchState({ isSearching: false, searchResult: null, hasSearched: false });
    setNewChip('');
    setNewExample('');
  }, [initialData, selectedText, isOpen]);

  const handleInputChange = (field: keyof TooltipFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleLinkChange = (value: string) => {
    const path = extractPath(value);
    setFormData(prev => ({ ...prev, link: path }));
  };

  const handleWordSearch = async () => {
    const searchTerm = formData.word.trim();
    if (!searchTerm) return;

    setSearchState(prev => ({ ...prev, isSearching: true }));

    try {
      const result = await WordLookupService.searchWord(searchTerm);
      setSearchState({ isSearching: false, searchResult: result, hasSearched: true });

      if (result.found && result.word) {
        const convertedData = WordLookupService.convertToTooltipData(result.word);
        const merged = { ...formData, ...convertedData, word: formData.word };
        setFormData(merged);
        setHasWordData(true);
        setVisibleFields(getPopulatedFieldKeys(merged));
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchState({
        isSearching: false,
        searchResult: { found: false, error: 'Search failed' },
        hasSearched: true,
      });
    }
  };

  const toggleFieldVisibility = (fieldKey: string) => {
    setVisibleFields(prev => (prev.includes(fieldKey) ? prev.filter(f => f !== fieldKey) : [...prev, fieldKey]));
  };

  const addExample = () => {
    if (newExample.trim()) {
      setFormData(prev => ({
        ...prev,
        examples: [...(prev.examples || []), newExample.trim()],
      }));
      setNewExample('');
    }
  };

  const removeExample = (index: number) => {
    setFormData(prev => ({
      ...prev,
      examples: prev.examples?.filter((_, i) => i !== index) || [],
    }));
  };

  const addPrincipalPart = () => {
    setFormData(prev => ({
      ...prev,
      principalParts: [...(prev.principalParts || []), ''],
    }));
  };

  const updatePrincipalPart = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      principalParts: prev.principalParts?.map((part, i) => (i === index ? value : part)) || [],
    }));
  };

  const removePrincipalPart = (index: number) => {
    setFormData(prev => ({
      ...prev,
      principalParts: prev.principalParts?.filter((_, i) => i !== index) || [],
    }));
  };

  const addChip = () => {
    if (newChip.trim()) {
      setFormData(prev => ({
        ...prev,
        chips: [...(prev.chips || []), newChip.trim()],
      }));
      setNewChip('');
    }
  };

  const removeChip = (index: number) => {
    setFormData(prev => ({
      ...prev,
      chips: prev.chips?.filter((_, i) => i !== index) || [],
    }));
  };

  const addCustomSection = () => {
    const sections = formData.customSections || [];
    if (sections.length >= 5) return;
    setFormData(prev => ({
      ...prev,
      customSections: [...sections, { label: '', content: '' }],
    }));
  };

  const updateCustomSection = (index: number, field: 'label' | 'content', value: string) => {
    setFormData(prev => ({
      ...prev,
      customSections: prev.customSections?.map((s, i) => (i === index ? { ...s, [field]: value } : s)) || [],
    }));
  };

  const removeCustomSection = (index: number) => {
    setFormData(prev => ({
      ...prev,
      customSections: prev.customSections?.filter((_, i) => i !== index) || [],
    }));
  };

  const handleSave = () => {
    const dataWithVisibility: TooltipFormData = {
      ...formData,
      visibleFields: mode === 'word-lookup' && hasWordData ? visibleFields : undefined,
    };
    const cleanedData = cleanFormData(dataWithVisibility);
    const completeData: TooltipFormData = {
      word: cleanedData.word || formData.word,
      translation: cleanedData.translation,
      pronunciation: cleanedData.pronunciation,
      partOfSpeech: cleanedData.partOfSpeech,
      wordType: cleanedData.wordType,
      definition: cleanedData.definition,
      examples: cleanedData.examples,
      etymology: cleanedData.etymology,
      gender: cleanedData.gender,
      declensionClass: cleanedData.declensionClass,
      conjugationClass: cleanedData.conjugationClass,
      grammaticalInfo: cleanedData.grammaticalInfo,
      principalParts: cleanedData.principalParts,
      link: cleanedData.link,
      title: cleanedData.title,
      chips: cleanedData.chips,
      customSections: cleanedData.customSections,
      visibleFields: cleanedData.visibleFields,
    };
    onSave(completeData);
    onClose();
  };

  const handleClose = () => {
    setFormData(getEmptyFormData());
    setNewExample('');
    setNewChip('');
    setSearchState({ isSearching: false, searchResult: null, hasSearched: false });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Tooltip' : 'Add Tooltip'}</DialogTitle>
          <DialogDescription>
            {initialData ? 'Edit the tooltip information.' : 'Create an interactive tooltip for the selected text.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Title — always visible */}
          <div>
            <Label htmlFor="tooltip-title">Title</Label>
            <Input
              id="tooltip-title"
              value={formData.title || ''}
              onChange={e => handleInputChange('title', e.target.value)}
              placeholder="Display title (defaults to word if empty)"
              className="mt-1"
            />
          </div>

          {/* Mode Tabs */}
          <Tabs value={mode} onValueChange={v => setMode(v as 'custom' | 'word-lookup')} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="custom">Custom</TabsTrigger>
              <TabsTrigger value="word-lookup">Word Lookup</TabsTrigger>
            </TabsList>

            {/* Custom Tab */}
            <TabsContent value="custom" className="space-y-6 mt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Custom Sections</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCustomSection}
                    disabled={(formData.customSections || []).length >= 5}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Section
                  </Button>
                </div>
                {formData.customSections?.map((section, index) => (
                  <div key={index} className="border rounded-lg p-3 space-y-2">
                    <div className="flex gap-2 items-center">
                      <Input
                        value={section.label}
                        onChange={e => updateCustomSection(index, 'label', e.target.value)}
                        placeholder="Section heading"
                        className="flex-1"
                      />
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeCustomSection(index)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <MiniRichEditor
                      content={section.content}
                      onChange={html => updateCustomSection(index, 'content', html)}
                      placeholder="Section_content"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label>Chips</Label>
                <div className="flex gap-2">
                  <Input
                    value={newChip}
                    onChange={e => setNewChip(e.target.value)}
                    placeholder="Add a chip"
                    onKeyPress={e => e.key === 'Enter' && addChip()}
                  />
                  <Button type="button" onClick={addChip} size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {formData.chips && formData.chips.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {formData.chips.map((chip, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-1">
                        {chip}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeChip(index)}
                          className="h-4 w-4 p-0 hover:bg-transparent">
                          <X className="w-3 h-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Word Lookup Tab */}
            <TabsContent value="word-lookup" className="space-y-6 mt-4">
              <div className="space-y-3">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label htmlFor="word">Word</Label>
                    <Input
                      id="word"
                      value={formData.word}
                      onChange={e => handleInputChange('word', e.target.value)}
                      placeholder="Enter a word to search"
                      className="mt-1"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleWordSearch}
                    disabled={!formData.word.trim() || searchState.isSearching}
                    variant="outline"
                    className="h-10">
                    {searchState.isSearching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    {searchState.isSearching ? 'Searching...' : 'Search'}
                  </Button>
                </div>

                {searchState.hasSearched && (
                  <Alert
                    className={
                      searchState.searchResult?.found
                        ? 'border-green-200 bg-green-50'
                        : 'border-yellow-200 bg-yellow-50'
                    }>
                    {searchState.searchResult?.found ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    )}
                    <AlertDescription className="text-sm">
                      {searchState.searchResult?.found
                        ? 'Word found! Form has been auto-filled.'
                        : searchState.searchResult?.error
                          ? `Search error: ${searchState.searchResult.error}`
                          : 'Word not found. You can manually enter information below.'}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {hasWordData && (
                <div className="space-y-4 border rounded-lg p-4 overflow-hidden">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Word Data</h3>
                    <p className="text-xs text-muted-foreground">Uncheck fields to hide them from students</p>
                  </div>

                  <div className="space-y-4">
                    <FieldWithCheckbox fieldKey="translation" visible={visibleFields} onToggle={toggleFieldVisibility}>
                      <SimpleInput
                        label="Translation"
                        value={formData.translation || ''}
                        onChange={value => handleInputChange('translation', value)}
                        placeholder="English translation"
                      />
                    </FieldWithCheckbox>

                    <FieldWithCheckbox
                      fieldKey="pronunciation"
                      visible={visibleFields}
                      onToggle={toggleFieldVisibility}>
                      <SimpleTextarea
                        label="Pronunciation"
                        value={formData.pronunciation || ''}
                        onChange={value => handleInputChange('pronunciation', value)}
                        placeholder="IPA pronunciation"
                        rows={2}
                      />
                    </FieldWithCheckbox>

                    <FieldWithCheckbox fieldKey="partOfSpeech" visible={visibleFields} onToggle={toggleFieldVisibility}>
                      <SimpleInput
                        label="Part of Speech"
                        value={formData.partOfSpeech || ''}
                        onChange={value => handleInputChange('partOfSpeech', value)}
                        placeholder="e.g., noun, verb, adjective"
                      />
                    </FieldWithCheckbox>

                    <FieldWithCheckbox fieldKey="wordType" visible={visibleFields} onToggle={toggleFieldVisibility}>
                      <SimpleInput
                        label="Word Type Details"
                        value={formData.wordType || ''}
                        onChange={value => handleInputChange('wordType', value)}
                        placeholder="Additional type information"
                      />
                    </FieldWithCheckbox>

                    <FieldWithCheckbox fieldKey="definition" visible={visibleFields} onToggle={toggleFieldVisibility}>
                      <SimpleTextarea
                        label="Definition"
                        value={formData.definition || ''}
                        onChange={value => handleInputChange('definition', value)}
                        placeholder="Detailed definition"
                        rows={3}
                      />
                    </FieldWithCheckbox>

                    <FieldWithCheckbox fieldKey="examples" visible={visibleFields} onToggle={toggleFieldVisibility}>
                      <div>
                        <Label>Examples</Label>
                        <div className="mt-1 space-y-2">
                          <div className="flex gap-2">
                            <Input
                              value={newExample}
                              onChange={e => setNewExample(e.target.value)}
                              placeholder="Add an example sentence"
                              onKeyPress={e => e.key === 'Enter' && addExample()}
                            />
                            <Button type="button" onClick={addExample} size="sm">
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                          {formData.examples && formData.examples.length > 0 && (
                            <div className="space-y-1">
                              {formData.examples.map((example, index) => (
                                <div key={index} className="flex items-center gap-2">
                                  <Badge variant="secondary" className="flex-1 justify-between">
                                    <span className="text-sm">{example}</span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeExample(index)}
                                      className="h-4 w-4 p-0 hover:bg-transparent">
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </FieldWithCheckbox>

                    <FieldWithCheckbox fieldKey="etymology" visible={visibleFields} onToggle={toggleFieldVisibility}>
                      <SimpleTextarea
                        label="Etymology"
                        value={formData.etymology || ''}
                        onChange={value => handleInputChange('etymology', value)}
                        placeholder="Word origin and history"
                        rows={2}
                      />
                    </FieldWithCheckbox>

                    <FieldWithCheckbox fieldKey="gender" visible={visibleFields} onToggle={toggleFieldVisibility}>
                      <SimpleSelect
                        label="Gender"
                        value={formData.gender || ''}
                        onChange={value => handleInputChange('gender', value)}
                        placeholder="Select gender..."
                        options={[
                          { value: 'masculine', label: 'Masculine' },
                          { value: 'feminine', label: 'Feminine' },
                          { value: 'neuter', label: 'Neuter' },
                        ]}
                      />
                    </FieldWithCheckbox>

                    <FieldWithCheckbox
                      fieldKey="declensionClass"
                      visible={visibleFields}
                      onToggle={toggleFieldVisibility}>
                      <SimpleSelect
                        label="Declension Class"
                        value={formData.declensionClass || ''}
                        onChange={value => handleInputChange('declensionClass', value)}
                        placeholder="Select declension..."
                        options={[
                          { value: '1st', label: '1st Declension' },
                          { value: '2nd', label: '2nd Declension' },
                          { value: '3rd', label: '3rd Declension' },
                          { value: '4th', label: '4th Declension' },
                          { value: '5th', label: '5th Declension' },
                          { value: '1st-2nd', label: '1st-2nd Declension' },
                          { value: '3rd-one-termination', label: '3rd Declension (one termination)' },
                          { value: '3rd-two-termination', label: '3rd Declension (two termination)' },
                          { value: '3rd-three-termination', label: '3rd Declension (three termination)' },
                        ]}
                      />
                    </FieldWithCheckbox>

                    <FieldWithCheckbox
                      fieldKey="conjugationClass"
                      visible={visibleFields}
                      onToggle={toggleFieldVisibility}>
                      <SimpleSelect
                        label="Conjugation Class"
                        value={formData.conjugationClass || ''}
                        onChange={value => handleInputChange('conjugationClass', value)}
                        placeholder="Select conjugation..."
                        options={[
                          { value: '1st', label: '1st Conjugation' },
                          { value: '2nd', label: '2nd Conjugation' },
                          { value: '3rd', label: '3rd Conjugation' },
                          { value: '3rd-io', label: '3rd Conjugation (i-stem)' },
                          { value: '4th', label: '4th Conjugation' },
                          { value: 'irregular', label: 'Irregular' },
                        ]}
                      />
                    </FieldWithCheckbox>

                    <FieldWithCheckbox
                      fieldKey="grammaticalInfo"
                      visible={visibleFields}
                      onToggle={toggleFieldVisibility}>
                      <SimpleInput
                        label="Grammatical Information"
                        value={formData.grammaticalInfo || ''}
                        onChange={value => handleInputChange('grammaticalInfo', value)}
                        placeholder="e.g., puella, -ae f / amo, amare, amavi, amatus"
                      />
                    </FieldWithCheckbox>

                    <FieldWithCheckbox
                      fieldKey="principalParts"
                      visible={visibleFields}
                      onToggle={toggleFieldVisibility}>
                      <div>
                        <Label>Principal Parts</Label>
                        <div className="mt-1 space-y-2">
                          {formData.principalParts && formData.principalParts.length > 0 && (
                            <div className="space-y-2">
                              {formData.principalParts.map((part, index) => (
                                <div key={index} className="flex gap-2">
                                  <Input
                                    value={part}
                                    onChange={e => updatePrincipalPart(index, e.target.value)}
                                    placeholder={`Part ${index + 1}`}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => removePrincipalPart(index)}>
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                          <Button type="button" variant="outline" size="sm" onClick={addPrincipalPart}>
                            <Plus className="w-4 h-4 mr-1" />
                            Add Principal Part
                          </Button>
                        </div>
                      </div>
                    </FieldWithCheckbox>

                    <FieldWithCheckbox fieldKey="link" visible={visibleFields} onToggle={toggleFieldVisibility}>
                      <SimpleInput
                        label="Link"
                        value={formData.link || ''}
                        onChange={handleLinkChange}
                        placeholder="Paste URL or path (e.g., /words/puella)"
                      />
                    </FieldWithCheckbox>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Chips</Label>
                <div className="flex gap-2">
                  <Input
                    value={newChip}
                    onChange={e => setNewChip(e.target.value)}
                    placeholder="Add a chip"
                    onKeyPress={e => e.key === 'Enter' && addChip()}
                  />
                  <Button type="button" onClick={addChip} size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {formData.chips && formData.chips.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {formData.chips.map((chip, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-1">
                        {chip}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeChip(index)}
                          className="h-4 w-4 p-0 hover:bg-transparent">
                          <X className="w-3 h-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex justify-between pt-4 border-t">
          <div>
            {initialData && onRemove && (
              <Button variant="destructive" onClick={onRemove}>
                Remove Tooltip
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formData.word.trim() && !formData.title?.trim()}>
              {initialData ? 'Update Tooltip' : 'Save Tooltip'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const FieldWithCheckbox: React.FC<{
  fieldKey: string;
  visible: string[];
  onToggle: (key: string) => void;
  children: React.ReactNode;
}> = ({ fieldKey, visible, onToggle, children }) => {
  const label = WORD_DATA_FIELDS.find(f => f.key === fieldKey)?.label || fieldKey;
  return (
    <div className="flex gap-3 items-start">
      <div className="pt-7 flex items-center">
        <Checkbox
          checked={visible.includes(fieldKey)}
          onCheckedChange={() => onToggle(fieldKey)}
          aria-label={`Show ${label} to students`}
        />
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">{children}</div>
    </div>
  );
};
