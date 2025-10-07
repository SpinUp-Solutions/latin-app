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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    setDelayInputValue(autoAdvance.delay.toString());
  }, [autoAdvance.delay]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between cursor-pointer text-sm" onClick={onToggle}>
          <span>Page Settings</span>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </CardTitle>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="auto-advance"
              checked={autoAdvance.enabled}
              onChange={e => handleEnabledChange(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="auto-advance" className="text-sm font-medium">
              Auto-advance to next page after completion
            </label>
          </div>

          {autoAdvance.enabled && (
            <div>
              <label className="block text-sm font-medium mb-1">Delay (ms)</label>
              <input
                type="number"
                value={delayInputValue}
                onChange={e => handleDelayChange(e.target.value)}
                onBlur={handleDelayBlur}
                className="w-full p-2 border rounded-md text-sm"
                placeholder="2000"
                min="0"
                step="100"
              />
              <div className="text-xs text-gray-500 mt-1">Time to wait after all exercises are completed</div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};
