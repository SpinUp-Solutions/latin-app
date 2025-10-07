import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Trash2, HelpCircle } from 'lucide-react';
import { SimpleInput, SimpleTextarea } from '@/src/components/ui/form-components';

interface FillItem {
  text: string;
  answer: string;
  hint?: string;
  explanation?: string;
}

interface FillItemCardProps {
  item: FillItem;
  index: number;
  onUpdate: (field: keyof FillItem, value: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export const FillItemCard: React.FC<FillItemCardProps> = ({ item, index, onUpdate, onRemove, canRemove }) => {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <h4 className="font-medium">Item {index + 1}</h4>
          <Button onClick={onRemove} size="sm" variant="ghost" disabled={!canRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <SimpleTextarea
              label="Question/Prompt Text"
              value={item.text}
              onChange={value => onUpdate('text', value)}
              placeholder="Enter the question or prompt that will be shown to students..."
              rows={2}
              id={`text-${index}`}
            />
            <p className="text-xs text-gray-500 mt-1">
              This is what students will see. For example: &quot;Complete the Latin verb: audi___&quot; or
              &quot;Translate: I hear = audi_&quot;
            </p>
          </div>

          <div>
            <SimpleInput
              label="Correct Answer"
              value={item.answer}
              onChange={value => onUpdate('answer', value)}
              placeholder="Enter the correct answer..."
              id={`answer-${index}`}
            />
            <p className="text-xs text-gray-500 mt-1">Students must type this exact answer (case-insensitive)</p>
          </div>

          <div>
            <div className="flex items-center gap-1 mb-1">
              <HelpCircle className="h-3 w-3" />
              <span className="text-xs font-medium">Hint (optional)</span>
            </div>
            <SimpleTextarea
              label=""
              value={item.hint || ''}
              onChange={value => onUpdate('hint', value)}
              placeholder="Enter a helpful hint for students..."
              rows={2}
              id={`hint-${index}`}
            />
            <p className="text-xs text-gray-500 mt-1">
              Shown when students make incorrect attempts (if enabled in feedback config)
            </p>
          </div>

          <div>
            <SimpleTextarea
              label="Explanation (optional)"
              value={item.explanation || ''}
              onChange={value => onUpdate('explanation', value)}
              placeholder="Enter a detailed explanation for the correct answer..."
              rows={2}
              id={`explanation-${index}`}
            />
            <p className="text-xs text-gray-500 mt-1">Shown after correct answers (if enabled in feedback config)</p>
          </div>

          <div className="mt-3 p-3 bg-gray-50 rounded border">
            <label className="block text-xs font-medium mb-2">Preview:</label>
            <div className="text-sm">
              <div className="mb-2">{item.text || 'Question/prompt will appear here'}</div>
              <input
                type="text"
                placeholder={item.hint || 'Type your answer in Latin...'}
                className="w-full p-2 border rounded text-sm bg-white"
                disabled
                value=""
              />
              <div className="text-xs text-gray-500 mt-1">
                Expected answer: <span className="font-mono">{item.answer || 'answer'}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
