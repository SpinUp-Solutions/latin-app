import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { hasVisibleFeedbackContent } from '@/src/utils/feedbackVisibility';
import { SimpleRichDisplay } from '../core/simple-rich-display';

type ExerciseIntroVariant = 'compact' | 'passage' | 'plain';

interface ExerciseIntroProps {
  title?: string;
  audioPath?: string | null;
  instructions?: string;
  variant?: ExerciseIntroVariant;
}

const TITLE_CLASS: Record<ExerciseIntroVariant, string> = {
  compact: 'text-lg font-serif text-roman-red mb-2',
  passage: 'text-xl font-serif text-roman-red mb-4',
  plain: 'text-lg font-serif text-roman-red mb-2',
};

const INSTRUCTIONS_CLASS: Record<ExerciseIntroVariant, string> = {
  compact: 'p-4 bg-roman-parchment rounded-lg mb-4',
  passage: 'p-6 bg-roman-parchment rounded-lg mb-4',
  plain: 'text-roman-stone',
};

export function ExerciseIntro({ title, audioPath, instructions, variant = 'compact' }: ExerciseIntroProps) {
  const showTitle = variant === 'plain' || Boolean(title);
  const visibleInstructions =
    typeof instructions === 'string' && hasVisibleFeedbackContent(instructions) ? instructions : null;

  return (
    <>
      <div className="flex justify-between items-start">
        {showTitle && title !== undefined && (
          <h3 className={TITLE_CLASS[variant]}>
            <SimpleRichDisplay content={title} />
          </h3>
        )}
        {audioPath ? (
          variant === 'plain' ? (
            <AudioPlayButton audioPath={audioPath} />
          ) : (
            <AudioPlayButton
              audioPath={audioPath}
              variant="default"
              size="sm"
              className="ml-2 rounded-full border-roman-terracotta/20 hover:border-roman-terracotta hover:bg-roman-parchment"
            />
          )
        ) : null}
      </div>
      {visibleInstructions && (
        <div className={INSTRUCTIONS_CLASS[variant]}>
          {variant === 'passage' ? (
            <SimpleRichDisplay content={visibleInstructions} className="whitespace-pre-wrap break-words" />
          ) : (
            <SimpleRichDisplay content={visibleInstructions} />
          )}
        </div>
      )}
    </>
  );
}
