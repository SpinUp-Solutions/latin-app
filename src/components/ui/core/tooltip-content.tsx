'use client';

import React from 'react';
import { Badge } from '@/src/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import { TooltipData } from '@/src/types/tooltip';
import { SimpleRichDisplay } from './simple-rich-display';

interface TooltipContentProps extends Omit<TooltipData, 'id'> {
  className?: string;
  onMoreDetails?: () => void;
}

const TooltipContentComponent: React.FC<TooltipContentProps> = ({
  word,
  translation,
  pronunciation,
  partOfSpeech,
  wordType,
  definition,
  examples = [],
  etymology,
  gender,
  declensionClass,
  conjugationClass,
  grammaticalInfo,
  principalParts = [],
  link,
  title,
  chips = [],
  customSections = [],
  visibleFields,
  className,
  onMoreDetails,
}) => {
  const isFieldVisible = (field: string) =>
    !visibleFields || visibleFields.length === 0 || visibleFields.includes(field);

  const handleMoreDetails = () => {
    if (onMoreDetails) {
      onMoreDetails();
    } else if (link) {
      window.open(link, '_blank');
    }
  };

  return (
    <div className={`w-72 max-w-sm rounded-lg border border-roman-terracotta/20 overflow-hidden ${className || ''}`}>
      <div className="bg-roman-parchment px-3 pt-3 pb-2 border-b border-roman-terracotta/10">
        <h3 className="text-sm font-serif font-semibold text-foreground tracking-wide">{title || word}</h3>
        {isFieldVisible('pronunciation') && pronunciation && (
          <div className="text-xs text-roman-stone font-mono mt-0.5">/{pronunciation}/</div>
        )}
        {(partOfSpeech || gender || declensionClass || conjugationClass || wordType || chips.length > 0) && (
          <div className="flex gap-1 flex-wrap mt-1.5">
            {isFieldVisible('partOfSpeech') && partOfSpeech && (
              <Badge
                variant="secondary"
                className="text-[10px] py-0 px-1.5 h-4 bg-roman-red/10 text-roman-red border-0">
                {partOfSpeech}
              </Badge>
            )}
            {isFieldVisible('gender') && gender && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1.5 h-4 border-roman-terracotta/30 text-roman-stone">
                {gender}
              </Badge>
            )}
            {isFieldVisible('declensionClass') && declensionClass && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1.5 h-4 border-roman-terracotta/30 text-roman-stone">
                {declensionClass}
              </Badge>
            )}
            {isFieldVisible('conjugationClass') && conjugationClass && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1.5 h-4 border-roman-terracotta/30 text-roman-stone">
                {conjugationClass}
              </Badge>
            )}
            {isFieldVisible('wordType') && wordType && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1.5 h-4 border-roman-terracotta/30 text-roman-stone">
                {wordType}
              </Badge>
            )}
            {chips.map((chip, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="text-[10px] py-0 px-1.5 h-4 bg-roman-gold/15 text-roman-stone border-0">
                {chip}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white px-3 py-2 space-y-2">
        {isFieldVisible('translation') && translation && (
          <div>
            <h4 className="text-[10px] font-serif text-roman-stone uppercase tracking-wider mb-0.5">Translation</h4>
            <SimpleRichDisplay content={translation} className="text-xs" />
          </div>
        )}

        {isFieldVisible('definition') && definition && (
          <div>
            <h4 className="text-[10px] font-serif text-roman-stone uppercase tracking-wider mb-0.5">Definition</h4>
            <SimpleRichDisplay content={definition} className="text-xs" />
          </div>
        )}

        {isFieldVisible('grammaticalInfo') && grammaticalInfo && (
          <div>
            <h4 className="text-[10px] font-serif text-roman-stone uppercase tracking-wider mb-0.5">Grammar</h4>
            <SimpleRichDisplay content={grammaticalInfo} className="text-xs font-mono" />
          </div>
        )}

        {isFieldVisible('principalParts') && principalParts.length > 0 && (
          <div>
            <h4 className="text-[10px] font-serif text-roman-stone uppercase tracking-wider mb-0.5">Principal Parts</h4>
            <SimpleRichDisplay content={principalParts.join(', ')} className="text-xs font-mono" />
          </div>
        )}

        {isFieldVisible('examples') && examples.length > 0 && (
          <div>
            <h4 className="text-[10px] font-serif text-roman-stone uppercase tracking-wider mb-0.5">Examples</h4>
            <ul className="text-xs space-y-0.5">
              {examples.slice(0, 2).map((example: string, index: number) => (
                <li key={index} className="italic text-roman-stone">
                  &ldquo;{example}&rdquo;
                </li>
              ))}
            </ul>
          </div>
        )}

        {isFieldVisible('etymology') && etymology && (
          <div>
            <h4 className="text-[10px] font-serif text-roman-stone uppercase tracking-wider mb-0.5">Etymology</h4>
            <SimpleRichDisplay content={etymology} className="text-xs text-roman-stone" />
          </div>
        )}

        {customSections.map((section, index) => (
          <div key={index}>
            <h4 className="text-[10px] font-serif text-roman-stone uppercase tracking-wider mb-0.5">{section.label}</h4>
            <SimpleRichDisplay content={section.content} className="text-xs" />
          </div>
        ))}

        {(link || onMoreDetails) && (
          <div className="pt-1.5 border-t border-roman-terracotta/10">
            <button
              onClick={handleMoreDetails}
              className="w-full flex items-center justify-center gap-1 text-[11px] font-serif text-roman-terracotta hover:text-roman-red transition-colors py-1">
              <ExternalLink className="w-2.5 h-2.5" />
              More Details
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

TooltipContentComponent.displayName = 'TooltipContent';

export const TooltipContent = React.memo(TooltipContentComponent);

export default TooltipContent;
