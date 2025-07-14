import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import { Badge } from '@/src/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Alert, AlertDescription } from '@/src/components/ui/alert';
import { X, Plus, Search, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
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
                <div>
                  <Label htmlFor="translation">Translation</Label>
                  <Input
                    id="translation"
                    value={formData.translation}
                    onChange={e => handleInputChange('translation', e.target.value)}
                    placeholder="English translation"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="pronunciation">Pronunciation</Label>
                  <Input
                    id="pronunciation"
                    value={formData.pronunciation}
                    onChange={e => handleInputChange('pronunciation', e.target.value)}
                    placeholder="IPA pronunciation"
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="wordType">Word Type Details</Label>
                <Input
                  id="wordType"
                  value={formData.wordType}
                  onChange={e => handleInputChange('wordType', e.target.value)}
                  placeholder="Additional type information"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="definition">Definition</Label>
                <Textarea
                  id="definition"
                  value={formData.definition}
                  onChange={e => handleInputChange('definition', e.target.value)}
                  placeholder="Detailed definition"
                  className="mt-1"
                  rows={3}
                />
              </div>

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

              <div>
                <Label htmlFor="etymology">Etymology</Label>
                <Textarea
                  id="etymology"
                  value={formData.etymology}
                  onChange={e => handleInputChange('etymology', e.target.value)}
                  placeholder="Word origin and history"
                  className="mt-1"
                  rows={2}
                />
              </div>
            </TabsContent>

            <TabsContent value="noun" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <select
                    id="gender"
                    value={formData.gender}
                    onChange={e => handleInputChange('gender', e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                    <option value="">Select gender...</option>
                    <option value="masculine">Masculine</option>
                    <option value="feminine">Feminine</option>
                    <option value="neuter">Neuter</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="declensionClass">Declension</Label>
                  <select
                    id="declensionClass"
                    value={formData.declensionClass}
                    onChange={e => handleInputChange('declensionClass', e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                    <option value="">Select declension...</option>
                    <option value="1st">1st Declension</option>
                    <option value="2nd">2nd Declension</option>
                    <option value="3rd">3rd Declension</option>
                    <option value="4th">4th Declension</option>
                    <option value="5th">5th Declension</option>
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="grammaticalInfo">Grammatical Information</Label>
                <Input
                  id="grammaticalInfo"
                  value={formData.grammaticalInfo}
                  onChange={e => handleInputChange('grammaticalInfo', e.target.value)}
                  placeholder="e.g., puella, -ae f"
                  className="mt-1"
                />
              </div>
            </TabsContent>

            <TabsContent value="verb" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="conjugationClass">Conjugation</Label>
                  <select
                    id="conjugationClass"
                    value={formData.conjugationClass}
                    onChange={e => handleInputChange('conjugationClass', e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                    <option value="">Select conjugation...</option>
                    <option value="1st">1st Conjugation</option>
                    <option value="2nd">2nd Conjugation</option>
                    <option value="3rd">3rd Conjugation</option>
                    <option value="3rd-io">3rd Conjugation (i-stem)</option>
                    <option value="4th">4th Conjugation</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="grammaticalInfo">Grammatical Information</Label>
                  <Input
                    id="grammaticalInfo"
                    value={formData.grammaticalInfo}
                    onChange={e => handleInputChange('grammaticalInfo', e.target.value)}
                    placeholder="e.g., amo, amare, amavi, amatus"
                    className="mt-1"
                  />
                </div>
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
                <div>
                  <Label htmlFor="declensionClass">Declension Type</Label>
                  <select
                    id="declensionClass"
                    value={formData.declensionClass}
                    onChange={e => handleInputChange('declensionClass', e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                    <option value="">Select type...</option>
                    <option value="1st-2nd">1st-2nd Declension</option>
                    <option value="3rd">3rd Declension</option>
                    <option value="3rd-one-termination">3rd Declension (one termination)</option>
                    <option value="3rd-two-termination">3rd Declension (two termination)</option>
                    <option value="3rd-three-termination">3rd Declension (three termination)</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="grammaticalInfo">Grammatical Information</Label>
                  <Input
                    id="grammaticalInfo"
                    value={formData.grammaticalInfo}
                    onChange={e => handleInputChange('grammaticalInfo', e.target.value)}
                    placeholder="e.g., bonus, -a, -um"
                    className="mt-1"
                  />
                </div>
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
