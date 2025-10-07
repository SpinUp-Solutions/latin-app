import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Plus, Trash2, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { FeedbackConfig, FeedbackLevel, SuccessMessageConfig, ProgressionRules } from '@/src/types/exercises/base';
import {
  getSuccessMessageWithDefaults,
  getProgressionRulesWithDefaults,
  normalizeEscalationLevel,
} from '@/src/utils/feedbackDefaults';
import { SimpleRichEditor } from '../../core/simple-rich-editor';

interface FeedbackConfigEditorProps {
  feedbackConfig: FeedbackConfig;
  onChange: (config: FeedbackConfig) => void;
  itemProgressionDelay?: number;
  onItemProgressionDelayChange?: (delay: number) => void;
}

export const FeedbackConfigEditor: React.FC<FeedbackConfigEditorProps> = ({
  feedbackConfig,
  onChange,
  itemProgressionDelay,
  onItemProgressionDelayChange,
}) => {
  const [expandedSections, setExpandedSections] = useState({
    escalation: true,
    success: false,
    progression: false,
    timing: false,
  });

  const [timingInputValue, setTimingInputValue] = useState<string>((itemProgressionDelay || 2000).toString());

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleTimingChange = (value: string) => {
    setTimingInputValue(value);
  };

  const handleTimingBlur = () => {
    const numValue = parseInt(timingInputValue);
    const finalValue = isNaN(numValue) || numValue < 0 ? 2000 : numValue;
    setTimingInputValue(finalValue.toString());
    onItemProgressionDelayChange?.(finalValue);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    setTimingInputValue((itemProgressionDelay || 2000).toString());
  }, [itemProgressionDelay]);

  const updateEscalationLevels = (levels: FeedbackLevel[]) => {
    onChange({ ...feedbackConfig, escalationLevels: levels });
  };

  const updateSuccessMessage = (updates: Partial<SuccessMessageConfig>) => {
    const current = getSuccessMessageWithDefaults(feedbackConfig.successMessage);
    onChange({ ...feedbackConfig, successMessage: { ...current, ...updates } });
  };

  const updateProgressionRules = (updates: Partial<ProgressionRules>) => {
    const current = getProgressionRulesWithDefaults(feedbackConfig.progressionRules);
    onChange({ ...feedbackConfig, progressionRules: { ...current, ...updates } });
  };

  const addEscalationLevel = () => {
    const newLevel: FeedbackLevel = { message: '', showAnswer: false, showHint: false };
    updateEscalationLevels([...feedbackConfig.escalationLevels, newLevel]);
  };

  const updateEscalationLevel = (index: number, level: FeedbackLevel) => {
    const normalizedLevel = normalizeEscalationLevel(level);
    const newLevels = feedbackConfig.escalationLevels.map((l, i) => (i === index ? normalizedLevel : l));
    updateEscalationLevels(newLevels);
  };

  const removeEscalationLevel = (index: number) => {
    const newLevels = feedbackConfig.escalationLevels.filter((_, i) => i !== index);
    updateEscalationLevels(newLevels);
  };

  const successMessageWithDefaults = getSuccessMessageWithDefaults(feedbackConfig.successMessage);
  const progressionRulesWithDefaults = getProgressionRulesWithDefaults(feedbackConfig.progressionRules);

  return (
    <div className="space-y-6">
      {/* Explanation text at top */}
      <div className="text-sm text-gray-600">
        <p>
          <strong>Feedback Configuration:</strong> Controls how students receive help when they make mistakes and how
          exercises progress. Configure escalation levels for progressive hints, success messages for positive
          reinforcement, progression rules for exercise behavior, and timing for optimal learning pace.
        </p>
      </div>

      {/* Escalation Levels */}
      <Card>
        <CardHeader>
          <CardTitle
            className="flex items-center justify-between cursor-pointer text-base"
            onClick={() => toggleSection('escalation')}>
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4" />
              Escalation Levels
            </div>
            {expandedSections.escalation ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardTitle>
        </CardHeader>
        {expandedSections.escalation && (
          <CardContent className="space-y-4">
            <div className="text-sm text-gray-600">
              Progressive help system: when students make incorrect answers, the system moves through these levels. Each
              level can provide more assistance.
            </div>

            <div className="space-y-3">
              {feedbackConfig.escalationLevels.length > 0 ? (
                feedbackConfig.escalationLevels.map((level, index) => (
                  <Card key={index} className="border-l-4 border-l-orange-300">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium">Level {index + 1}</h4>
                        <Button onClick={() => removeEscalationLevel(index)} size="sm" variant="ghost">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium mb-1">Feedback Message (optional)</label>
                          <SimpleRichEditor
                            content={level.message || ''}
                            onChange={value => updateEscalationLevel(index, { ...level, message: value })}
                            className="w-full text-sm"
                            rows={2}
                            placeholder="e.g., 'Not quite right. Try again.' or 'Look at the verb ending...'"
                          />
                        </div>

                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={!!level.showHint}
                              onChange={e => updateEscalationLevel(index, { ...level, showHint: e.target.checked })}
                            />
                            Show Hint
                          </label>

                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={!!level.showAnswer}
                              onChange={e => updateEscalationLevel(index, { ...level, showAnswer: e.target.checked })}
                            />
                            Show Answer
                          </label>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-6 text-gray-500">
                  <div className="text-sm">No escalation levels configured</div>
                  <div className="text-xs">Students will receive no progressive help when making incorrect answers</div>
                </div>
              )}
            </div>

            <Button onClick={addEscalationLevel} variant="outline" size="sm" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Escalation Level
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Success Messages */}
      <Card>
        <CardHeader>
          <CardTitle
            className="flex items-center justify-between cursor-pointer text-base"
            onClick={() => toggleSection('success')}>
            <span>Success Messages</span>
            {expandedSections.success ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardTitle>
        </CardHeader>
        {expandedSections.success && (
          <CardContent className="space-y-4">
            <div className="text-sm text-gray-600">
              Positive reinforcement messages shown when students answer correctly.
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Default Success Message</label>
                <SimpleRichEditor
                  content={successMessageWithDefaults.default || ''}
                  onChange={value => updateSuccessMessage({ default: value })}
                  placeholder="e.g., 'Correct!' or 'Well done!'"
                  singleLine={true}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Completion Message</label>
                <SimpleRichEditor
                  content={successMessageWithDefaults.completion || ''}
                  onChange={value => updateSuccessMessage({ completion: value })}
                  placeholder="e.g., 'Excellent! You've completed the exercise!'"
                  singleLine={true}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Advance Message</label>
                <SimpleRichEditor
                  content={successMessageWithDefaults.advance || ''}
                  onChange={value => updateSuccessMessage({ advance: value })}
                  placeholder="e.g., 'Correct! Moving to the next question...'"
                  singleLine={true}
                  className="w-full"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={successMessageWithDefaults.showExplanation}
                    onChange={e => updateSuccessMessage({ showExplanation: e.target.checked })}
                  />
                  Show explanations for correct answers
                </label>
                <div className="text-xs text-gray-500 mt-1">
                  Controls whether to display detailed explanations for correct answers (e.g., &quot;Second person
                  singular present tense&quot;)
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Progression Rules */}
      <Card>
        <CardHeader>
          <CardTitle
            className="flex items-center justify-between cursor-pointer text-base"
            onClick={() => toggleSection('progression')}>
            <span>Progression Rules</span>
            {expandedSections.progression ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardTitle>
        </CardHeader>
        {expandedSections.progression && (
          <CardContent className="space-y-4">
            <div className="text-sm text-gray-600">
              Control how the exercise progresses and what interface elements students see.
            </div>

            <div className="grid grid-cols-1 gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={progressionRulesWithDefaults.autoAdvance}
                  onChange={e => updateProgressionRules({ autoAdvance: e.target.checked })}
                />
                Auto-advance after correct answer
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={progressionRulesWithDefaults.resetOnCorrect}
                  onChange={e => updateProgressionRules({ resetOnCorrect: e.target.checked })}
                />
                Reset error count on correct answer
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={progressionRulesWithDefaults.showProgress}
                  onChange={e => updateProgressionRules({ showProgress: e.target.checked })}
                />
                Show progress indicator
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={progressionRulesWithDefaults.allowManualAdvance}
                  onChange={e => updateProgressionRules({ allowManualAdvance: e.target.checked })}
                />
                Allow manual &quot;Next&quot; button
              </label>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Timing Configuration - Only show for multi-item exercises */}
      {onItemProgressionDelayChange && (
        <Card>
          <CardHeader>
            <CardTitle
              className="flex items-center justify-between cursor-pointer text-base"
              onClick={() => toggleSection('timing')}>
              <span>Timing Configuration</span>
              {expandedSections.timing ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CardTitle>
          </CardHeader>
          {expandedSections.timing && (
            <CardContent className="space-y-4">
              <div className="text-sm text-gray-600">
                Control the timing of exercise progression and auto-advance behavior.
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Item Progression Delay (ms)</label>
                <input
                  type="number"
                  value={timingInputValue}
                  onChange={e => handleTimingChange(e.target.value)}
                  onBlur={handleTimingBlur}
                  className="w-full p-2 border rounded-md text-sm"
                  placeholder="2000"
                  min="0"
                  step="100"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Time to wait before automatically advancing to the next exercise item after a correct answer
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
};
