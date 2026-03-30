import React from 'react';
import { SentenceDiagramFeedbackContent as SentenceDiagramFeedbackContentData } from './model';
import { SentenceDiagramSurface } from './SentenceDiagramSurface';
import { cn } from '@/src/lib/utils';

interface SentenceDiagramFeedbackContentProps {
  content: SentenceDiagramFeedbackContentData;
  translation?: string;
  className?: string;
}

export const SentenceDiagramFeedbackView: React.FC<SentenceDiagramFeedbackContentProps> = ({
  content,
  translation,
  className,
}) => {
  const hasText = content.text.trim() !== '';
  const hasAnnotations = content.annotations.length > 0;
  const hasTranslation = Boolean(translation?.trim());

  if (!hasText && !hasAnnotations && !hasTranslation) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {hasText || hasAnnotations ? (
        <SentenceDiagramSurface
          tokens={content.tokens}
          annotations={content.annotations}
          selection={null}
          onSelectionChange={() => undefined}
          disabled={true}
          className="border-current/15 bg-white/70"
        />
      ) : null}
      {hasTranslation ? <div className="text-xs italic opacity-80">&ldquo;{translation}&rdquo;</div> : null}
    </div>
  );
};

export default SentenceDiagramFeedbackView;
