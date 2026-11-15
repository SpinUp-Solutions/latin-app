import React from 'react';
import { Card, CardContent } from '@/src/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/src/components/ui/radio-group';
import { Label } from '@/src/components/ui/label';
import { CoreTypeSelect } from '@/src/components/ui/admin/vocabulary/CoreTypeSelect';
import type { WordType } from '@/shared/types/vocabulary/schemas/enums';

interface WordSourceSectionProps {
  value: 'filters' | 'pool';
  onChange: (value: 'filters' | 'pool') => void;
  coreType: WordType | null | undefined;
  onCoreTypeChange: (coreType: WordType | null) => void;
  filtersContent: React.ReactNode;
  poolContent: React.ReactNode;
}

export const WordSourceSection: React.FC<WordSourceSectionProps> = ({
  value,
  onChange,
  coreType,
  onCoreTypeChange,
  filtersContent,
  poolContent,
}) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-3">Word Source</label>
        <Card>
          <CardContent className="p-4">
            <RadioGroup value={value} onValueChange={onChange}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="filters" id="word-source-filters" />
                <Label htmlFor="word-source-filters">Custom Filters</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pool" id="word-source-pool" />
                <Label htmlFor="word-source-pool">Vocabulary Pool</Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>
      </div>

      <CoreTypeSelect id="generated-core-type" value={coreType} onChange={onCoreTypeChange} />

      {value === 'filters' ? filtersContent : poolContent}
    </div>
  );
};
