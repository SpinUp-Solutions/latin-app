'use client';

import React from 'react';
import { Badge } from '@/src/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import { TooltipData } from '@/src/types/tooltip';
import { SimpleRichDisplay } from './simple-rich-display';

interface TooltipContentProps extends Omit<TooltipData, 'id'> {
  className?: string;
}

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <h4 className="text-[10px] font-serif text-roman-stone uppercase tracking-wider mb-0.5">{label}</h4>
    {children}
  </div>
);

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
}) => {
  const isFieldVisible = (field: string) =>
    !visibleFields || visibleFields.length === 0 || visibleFields.includes(field);
  const outlineBadges = [
    ['gender', gender],
    ['declensionClass', declensionClass],
    ['conjugationClass', conjugationClass],
    ['wordType', wordType],
  ] as const;

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
            {outlineBadges.map(
              ([field, value]) =>
                isFieldVisible(field) &&
                value && (
                  <Badge
                    key={field}
                    variant="outline"
                    className="text-[10px] py-0 px-1.5 h-4 border-roman-terracotta/30 text-roman-stone">
                    {value}
                  </Badge>
                )
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
          <Section label="Definition">
            <SimpleRichDisplay content={translation} className="text-xs" />
          </Section>
        )}

        {isFieldVisible('definition') && definition && (
          <Section label="Definition">
            <SimpleRichDisplay content={definition} className="text-xs" />
          </Section>
        )}

        {isFieldVisible('grammaticalInfo') && grammaticalInfo && (
          <Section label="Dictionary Entry">
            <SimpleRichDisplay content={grammaticalInfo} className="text-xs font-mono" />
          </Section>
        )}

        {isFieldVisible('principalParts') && principalParts.length > 0 && (
          <Section label="Principal Parts">
            <SimpleRichDisplay content={principalParts.join(', ')} className="text-xs font-mono" />
          </Section>
        )}

        {isFieldVisible('examples') && examples.length > 0 && (
          <Section label="Examples">
            <ul className="text-xs space-y-0.5">
              {examples.slice(0, 2).map((example: string, index: number) => (
                <li key={index} className="italic text-roman-stone">
                  &ldquo;{example}&rdquo;
                </li>
              ))}
            </ul>
          </Section>
        )}

        {isFieldVisible('etymology') && etymology && (
          <Section label="Etymology">
            <SimpleRichDisplay content={etymology} className="text-xs text-roman-stone" />
          </Section>
        )}

        {customSections.map((section, index) => (
          <Section key={index} label={section.label}>
            <SimpleRichDisplay content={section.content} className="text-xs" />
          </Section>
        ))}

        {link && (
          <div className="pt-1.5 border-t border-roman-terracotta/10">
            <button
              onClick={() => window.open(link, '_blank')}
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
