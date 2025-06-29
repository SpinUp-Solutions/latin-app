import React from 'react';
import { FeedbackConfigEditor } from './FeedbackConfigEditor';
import type { FeedbackConfig } from '@/src/types/exercises/base';

interface ExerciseFeedbackSectionProps {
  feedbackConfig: FeedbackConfig;
  onChange: (config: FeedbackConfig) => void;
}

export const ExerciseFeedbackSection: React.FC<ExerciseFeedbackSectionProps> = ({ feedbackConfig, onChange }) => {
  return (
    <div>
      <h3 className="text-lg font-medium mb-4">Feedback Configuration</h3>
      <FeedbackConfigEditor feedbackConfig={feedbackConfig} onChange={onChange} />
    </div>
  );
};
