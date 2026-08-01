import React from 'react';
import { Button } from '@/src/components/ui/button';

interface RecordedAnswerControlsProps {
  isLastItem: boolean;
  onContinue: () => void;
}

export const RecordedAnswerControls: React.FC<RecordedAnswerControlsProps> = ({ isLastItem, onContinue }) => (
  <div className="space-y-3">
    <div className="rounded-md bg-gray-50 p-3 text-sm">Answer recorded.</div>
    <Button onClick={onContinue} className="w-full">
      {isLastItem ? 'Finish exercise' : 'Continue'}
    </Button>
  </div>
);
