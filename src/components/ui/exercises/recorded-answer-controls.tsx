import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';

interface RecordedAnswerControlsProps {
  isLastItem: boolean;
  onContinue: () => void;
}

export const RecordedAnswerControls: React.FC<RecordedAnswerControlsProps> = ({ isLastItem, onContinue }) => (
  <div className="mt-4 space-y-3">
    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
      <span>Answer recorded.</span>
    </div>
    <Button onClick={onContinue} className="w-full rounded-xl">
      {isLastItem ? 'Finish exercise' : 'Continue'}
    </Button>
  </div>
);
