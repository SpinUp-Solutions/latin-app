import React from 'react';
import { FeedbackConfigEditor } from './FeedbackConfigEditor';
import type { FeedbackConfig } from '@/src/types/exercises/base';

interface ExerciseFeedbackSectionProps {
  feedbackConfig: FeedbackConfig;
  onChange: (config: FeedbackConfig) => void;
  itemProgressionDelay?: number;
  onItemProgressionDelayChange?: (delay: number) => void;
  exerciseId?: string;
}

export const ExerciseFeedbackSection: React.FC<ExerciseFeedbackSectionProps> = ({
  feedbackConfig,
  onChange,
  itemProgressionDelay,
  onItemProgressionDelayChange,
  exerciseId,
}) => {
  const showTimingConfig = itemProgressionDelay !== undefined && onItemProgressionDelayChange !== undefined;

  return (
    <div>
      <h3 className="text-lg font-medium mb-4">Feedback Configuration</h3>
      <FeedbackConfigEditor
        key={exerciseId}
        feedbackConfig={feedbackConfig}
        onChange={onChange}
        itemProgressionDelay={showTimingConfig ? itemProgressionDelay : undefined}
        onItemProgressionDelayChange={showTimingConfig ? onItemProgressionDelayChange : undefined}
      />
    </div>
  );
};
