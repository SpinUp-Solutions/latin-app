import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Badge } from '@/src/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Alert, AlertDescription } from '@/src/components/ui/alert';
import { X, Plus, Search, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { SimpleInput, SimpleTextarea, SimpleSelect } from '@/src/components/ui/form-components';
import { TooltipData, TooltipFormData } from '@/src/types/tooltip';
import { WordLookupService, WordLookupResult } from '@/src/services/wordLookupService';
import { transformToFormData, cleanFormData, getEmptyFormData } from '@/src/utils/tooltipUtils';

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

export const TooltipEditorDialog: React.FC<TooltipEditorDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  onRemove,
  initialData = null,
  selectedText = '',
}) => {
  const [formData, setFormData] = useState<TooltipFormData>(transformToFormData(initialData, selectedText));

  const [newExample, setNewExample] = useState('');
  const [searchState, setSearchState] = useState<SearchState>({
    isSearching: false,
    searchResult: null,
    hasSearched: false,
  });
  const [activeTab, setActiveTab] = useState('basic');

  // Update form data when initialData changes
  useEffect(() => {
    setFormData(transformToFormData(initialData, selectedText));

    // Reset search state when dialog opens
    setSearchState({
      isSearching: false,
      searchResult: null,
      hasSearched: false,
    });
    setActiveTab('basic');
  }, [initialData, selectedText, isOpen]);

  const handleInputChange = (field: keyof TooltipFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleWordSearch = async () => {
    const searchTerm = formData.word.trim();
    if (!searchTerm) return;

    setSearchState(prev => ({ ...prev, isSearching: true }));

    try {
      const result = await WordLookupService.searchWord(searchTerm);
      setSearchState({
        isSearching: false,
        searchResult: result,
        hasSearched: true,
      });

      if (result.found && result.word) {
        const convertedData = WordLookupService.convertToTooltipData(result.word);
        setFormData(prev => ({
          ...prev,
          ...convertedData,
          word: prev.word, // Keep the original word field
        }));
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

  const addExample = () => {
    if (newExample.trim()) {
      setFormData(prev => ({
        ...prev,
        examples: [...(prev.examples || []), newExample.trim()],
      }));
      setNewExample('');
    }
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

  const removeExample = (index: number) => {
    setFormData(prev => ({
      ...prev,
      examples: prev.examples?.filter((_, i) => i !== index) || [],
    }));
  };

  const handleSave = () => {
    const cleanedData = cleanFormData(formData);
    // Ensure required fields are present
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
    };
    onSave(completeData);
    onClose();
  };

  const handleClose = () => {
    setFormData(getEmptyFormData());
    setNewExample('');
    setSearchState({
      isSearching: false,
      searchResult: null,
      hasSearched: false,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Tooltip Information' : 'Add Tooltip Information'}</DialogTitle>
          <DialogDescription>
            {initialData
              ? 'Edit the tooltip information for this word.'
              : 'Add detailed information for the selected word to create an interactive tooltip.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Search Section */}
          <div className="space-y-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label htmlFor="word">Word *</Label>
                <Input
                  id="word"
                  value={formData.word}
                  onChange={e => handleInputChange('word', e.target.value)}
                  placeholder="Enter the word"
                  className="mt-1"
                />
              </div>
              <div>
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
            </div>

            {/* Search Results */}
            {searchState.hasSearched && (
              <Alert
                className={
                  searchState.searchResult?.found ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'
                }>
                {searchState.searchResult?.found ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                )}
                <AlertDescription className="text-sm">
                  {searchState.searchResult?.found
                    ? 'Word found! Form has been auto-filled with database information.'
                    : searchState.searchResult?.error
                      ? `Search error: ${searchState.searchResult.error}`
                      : 'Word not found in database. You can manually enter the information below.'}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Tabs
            value={activeTab}
            onValueChange={tab => {
              setActiveTab(tab);
              // Auto-set part of speech based on active tab
              if (tab === 'noun' || tab === 'verb' || tab === 'adjective') {
                handleInputChange('partOfSpeech', tab);
              }
            }}
            className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="noun">
                <span className={formData.partOfSpeech === 'noun' ? '' : 'opacity-70'}>Noun</span>
              </TabsTrigger>
              <TabsTrigger value="verb">
                <span className={formData.partOfSpeech === 'verb' ? '' : 'opacity-70'}>Verb</span>
              </TabsTrigger>
              <TabsTrigger value="adjective">
                <span className={formData.partOfSpeech === 'adjective' ? '' : 'opacity-70'}>Adjective</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <SimpleInput
                  label="Translation"
                  value={formData.translation || ''}
                  onChange={value => handleInputChange('translation', value)}
                  placeholder="English translation"
                />
                <SimpleInput
                  label="Pronunciation"
                  value={formData.pronunciation || ''}
                  onChange={value => handleInputChange('pronunciation', value)}
                  placeholder="IPA pronunciation"
                />
              </div>

              <SimpleInput
                label="Word Type Details"
                value={formData.wordType || ''}
                onChange={value => handleInputChange('wordType', value)}
                placeholder="Additional type information"
              />

              <SimpleTextarea
                label="Definition"
                value={formData.definition || ''}
                onChange={value => handleInputChange('definition', value)}
                placeholder="Detailed definition"
                rows={3}
              />

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

              <SimpleTextarea
                label="Etymology"
                value={formData.etymology || ''}
                onChange={value => handleInputChange('etymology', value)}
                placeholder="Word origin and history"
                rows={2}
              />
            </TabsContent>

            <TabsContent value="noun" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
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
                <SimpleSelect
                  label="Declension"
                  value={formData.declensionClass || ''}
                  onChange={value => handleInputChange('declensionClass', value)}
                  placeholder="Select declension..."
                  options={[
                    { value: '1st', label: '1st Declension' },
                    { value: '2nd', label: '2nd Declension' },
                    { value: '3rd', label: '3rd Declension' },
                    { value: '4th', label: '4th Declension' },
                    { value: '5th', label: '5th Declension' },
                  ]}
                />
              </div>
              <SimpleInput
                label="Grammatical Information"
                value={formData.grammaticalInfo || ''}
                onChange={value => handleInputChange('grammaticalInfo', value)}
                placeholder="e.g., puella, -ae f"
              />
            </TabsContent>

            <TabsContent value="verb" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <SimpleSelect
                  label="Conjugation"
                  value={formData.conjugationClass || ''}
                  onChange={value => handleInputChange('conjugationClass', value)}
                  placeholder="Select conjugation..."
                  options={[
                    { value: '1st', label: '1st Conjugation' },
                    { value: '2nd', label: '2nd Conjugation' },
                    { value: '3rd', label: '3rd Conjugation' },
                    { value: '3rd-io', label: '3rd Conjugation (i-stem)' },
                    { value: '4th', label: '4th Conjugation' },
                  ]}
                />
                <SimpleInput
                  label="Grammatical Information"
                  value={formData.grammaticalInfo || ''}
                  onChange={value => handleInputChange('grammaticalInfo', value)}
                  placeholder="e.g., amo, amare, amavi, amatus"
                />
              </div>

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
                          <Button type="button" variant="outline" size="sm" onClick={() => removePrincipalPart(index)}>
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
            </TabsContent>

            <TabsContent value="adjective" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <SimpleSelect
                  label="Declension Type"
                  value={formData.declensionClass || ''}
                  onChange={value => handleInputChange('declensionClass', value)}
                  placeholder="Select type..."
                  options={[
                    { value: '1st-2nd', label: '1st-2nd Declension' },
                    { value: '3rd', label: '3rd Declension' },
                    { value: '3rd-one-termination', label: '3rd Declension (one termination)' },
                    { value: '3rd-two-termination', label: '3rd Declension (two termination)' },
                    { value: '3rd-three-termination', label: '3rd Declension (three termination)' },
                  ]}
                />
                <SimpleInput
                  label="Grammatical Information"
                  value={formData.grammaticalInfo || ''}
                  onChange={value => handleInputChange('grammaticalInfo', value)}
                  placeholder="e.g., bonus, -a, -um"
                />
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
            <Button onClick={handleSave} disabled={!formData.word.trim()}>
              {initialData ? 'Update Tooltip' : 'Save Tooltip'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
