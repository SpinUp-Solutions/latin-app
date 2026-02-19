'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { TooltipData } from '@/src/types/tooltip';
import { SimpleRichDisplay } from './simple-rich-display';

interface TooltipContentProps extends Omit<TooltipData, 'id'> {
  className?: string;
  showMoreDetails?: boolean;
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
  title,
  chips = [],
  customSections = [],
  visibleFields,
  className,
  showMoreDetails = true,
  onMoreDetails,
}) => {
  const isFieldVisible = (field: string) =>
    !visibleFields || visibleFields.length === 0 || visibleFields.includes(field);

  const handleMoreDetails = () => {
    if (onMoreDetails) {
      onMoreDetails();
    } else {
      window.open('/sample-word-details', '_blank');
    }
  };
  return (
    <Card className={`w-72 max-w-sm shadow-lg border mt-[-40px] ${className || ''}`}>
      {' '}
      <CardHeader className="pb-1 pt-3 px-3">
        <CardTitle className="text-sm font-semibold">{title || word}</CardTitle>
        {isFieldVisible('pronunciation') && pronunciation && (
          <div className="text-xs text-muted-foreground font-mono">/{pronunciation}/</div>
        )}
        <div className="flex gap-1 flex-wrap">
          {isFieldVisible('partOfSpeech') && partOfSpeech && (
            <Badge variant="secondary" className="text-xs py-0 px-1 h-4">
              {partOfSpeech}
            </Badge>
          )}
          {isFieldVisible('gender') && gender && (
            <Badge variant="outline" className="text-xs py-0 px-1 h-4">
              {gender}
            </Badge>
          )}
          {isFieldVisible('declensionClass') && declensionClass && (
            <Badge variant="outline" className="text-xs py-0 px-1 h-4">
              {declensionClass}
            </Badge>
          )}
          {isFieldVisible('conjugationClass') && conjugationClass && (
            <Badge variant="outline" className="text-xs py-0 px-1 h-4">
              {conjugationClass}
            </Badge>
          )}
          {isFieldVisible('wordType') && wordType && (
            <Badge variant="outline" className="text-xs py-0 px-1 h-4">
              {wordType}
            </Badge>
          )}
          {chips.map((chip, index) => (
            <Badge key={index} variant="secondary" className="text-xs py-0 px-1 h-4">
              {chip}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0 px-3 pb-3">
        {isFieldVisible('translation') && translation && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Translation</h4>
            <SimpleRichDisplay content={translation} className="text-xs" />
          </div>
        )}

        {isFieldVisible('definition') && definition && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Definition</h4>
            <SimpleRichDisplay content={definition} className="text-xs" />
          </div>
        )}

        {isFieldVisible('grammaticalInfo') && grammaticalInfo && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Grammar</h4>
            <SimpleRichDisplay content={grammaticalInfo} className="text-xs font-mono" />
          </div>
        )}

        {isFieldVisible('principalParts') && principalParts.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
              Principal Parts
            </h4>
            <SimpleRichDisplay content={principalParts.join(', ')} className="text-xs font-mono" />
          </div>
        )}

        {isFieldVisible('examples') && examples.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Examples</h4>
            <ul className="text-xs space-y-0.5">
              {examples.slice(0, 2).map((example: string, index: number) => (
                <li key={index} className="italic text-muted-foreground">
                  &ldquo;{example}&rdquo;
                </li>
              ))}
            </ul>
          </div>
        )}

        {isFieldVisible('etymology') && etymology && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Etymology</h4>
            <SimpleRichDisplay content={etymology} className="text-xs text-muted-foreground" />
          </div>
        )}

        {customSections.map((section, index) => (
          <div key={index}>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
              {section.label}
            </h4>
            <SimpleRichDisplay content={section.content} className="text-xs" />
          </div>
        ))}

        {showMoreDetails && (
          <div className="pt-2 border-t">
            <Button variant="outline" size="sm" onClick={handleMoreDetails} className="w-full text-xs h-6 py-0">
              <ExternalLink className="w-2.5 h-2.5 mr-1" />
              More Details
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

TooltipContentComponent.displayName = 'TooltipContent';

export const TooltipContent = React.memo(TooltipContentComponent);

export default TooltipContent;
