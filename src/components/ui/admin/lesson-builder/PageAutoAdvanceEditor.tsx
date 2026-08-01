import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface PageAutoAdvanceEditorProps {
  autoAdvance?: { enabled: boolean; delay: number };
  onChange: (config: { enabled: boolean; delay: number }) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

export const PageAutoAdvanceEditor: React.FC<PageAutoAdvanceEditorProps> = ({
  autoAdvance = { enabled: true, delay: 2000 },
  onChange,
  isExpanded,
  onToggle,
}) => {
  const [delayInputValue, setDelayInputValue] = useState<string>(autoAdvance.delay.toString());

  const handleEnabledChange = (enabled: boolean) => {
    onChange({ ...autoAdvance, enabled });
  };

  const handleDelayChange = (value: string) => {
    setDelayInputValue(value);
  };

  const handleDelayBlur = () => {
    const numValue = parseInt(delayInputValue);
    const finalValue = isNaN(numValue) || numValue < 0 ? 2000 : numValue;
    setDelayInputValue(finalValue.toString());
    onChange({ ...autoAdvance, delay: finalValue });
  };

  React.useEffect(() => {
    setDelayInputValue(autoAdvance.delay.toString());
  }, [autoAdvance.delay]);

  return (
    <Card className="w-full">
      <CardHeader className="py-2 px-3">
        <CardTitle className="flex items-center justify-between cursor-pointer text-xs" onClick={onToggle}>
          <span>Page Settings</span>
          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </CardTitle>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-2 px-3 py-2">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="auto-advance"
              checked={autoAdvance.enabled}
              onChange={e => handleEnabledChange(e.target.checked)}
              className="rounded border-gray-300 h-3 w-3"
            />
            <label htmlFor="auto-advance" className="text-xs">
              Auto-advance to next page
            </label>
          </div>

          {autoAdvance.enabled && (
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600">Delay (ms)</label>
              <input
                type="number"
                value={delayInputValue}
                onChange={e => handleDelayChange(e.target.value)}
                onBlur={handleDelayBlur}
                className="w-full px-2 py-1 border rounded text-xs"
                placeholder="2000"
                min="0"
                step="100"
              />
              <div className="text-xs text-gray-500 mt-0.5">Wait time after completion</div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};
