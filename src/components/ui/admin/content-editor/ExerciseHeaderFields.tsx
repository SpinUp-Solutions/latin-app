import React from 'react';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { AudioUploadSection } from './AudioUploadSection';

interface ExerciseTitleInstructionsProps {
  title: string;
  instructions: string;
  onTitleChange: (value: string) => void;
  onInstructionsChange: (value: string) => void;
}

export const ExerciseTitleInstructions: React.FC<ExerciseTitleInstructionsProps> = ({
  title,
  instructions,
  onTitleChange,
  onInstructionsChange,
}) => {
  return (
    <>
      <div>
        <label className="block text-sm font-medium mb-1">Exercise Title</label>
        <SimpleRichEditor
          content={title}
          onChange={onTitleChange}
          placeholder="Enter exercise title..."
          singleLine={true}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Instructions</label>
        <SimpleRichEditor
          content={instructions}
          onChange={onInstructionsChange}
          placeholder="Provide instructions for students..."
          rows={3}
          className="w-full"
        />
      </div>
    </>
  );
};

interface ExerciseHeaderFieldsProps extends ExerciseTitleInstructionsProps {
  audioPath: string | null | undefined;
  onAudioPathChange: (audioPath: string | null) => void;
  contentItemId: string;
}

export const ExerciseHeaderFields: React.FC<ExerciseHeaderFieldsProps> = ({
  title,
  instructions,
  onTitleChange,
  onInstructionsChange,
  audioPath,
  onAudioPathChange,
  contentItemId,
}) => {
  return (
    <div className="space-y-4">
      <ExerciseTitleInstructions
        title={title}
        instructions={instructions}
        onTitleChange={onTitleChange}
        onInstructionsChange={onInstructionsChange}
      />
      <AudioUploadSection audioPath={audioPath} onAudioPathChange={onAudioPathChange} contentItemId={contentItemId} />
    </div>
  );
};
