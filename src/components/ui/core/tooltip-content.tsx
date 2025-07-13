import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { TooltipData } from '@/src/store/slices/lessonSlice';

interface TooltipContentProps extends Omit<TooltipData, 'id'> {
  className?: string;
  showMoreDetails?: boolean;
  onMoreDetails?: () => void;
}

export const TooltipContent: React.FC<TooltipContentProps> = ({
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
  className,
  showMoreDetails = true,
  onMoreDetails,
}) => {
  const handleMoreDetails = () => {
    if (onMoreDetails) {
      onMoreDetails();
    } else {
      // Default behavior - open sample page
      window.open('/sample-word-details', '_blank');
    }
  };
  return (
    <Card className={`w-72 max-w-sm shadow-lg border ${className || ''}`}>
      <CardHeader className="pb-1 pt-3 px-3">
        <CardTitle className="text-sm font-semibold">{word}</CardTitle>
        {pronunciation && <div className="text-xs text-muted-foreground font-mono">/{pronunciation}/</div>}
        <div className="flex gap-1 flex-wrap">
          {partOfSpeech && (
            <Badge variant="secondary" className="text-xs py-0 px-1 h-4">
              {partOfSpeech}
            </Badge>
          )}
          {gender && (
            <Badge variant="outline" className="text-xs py-0 px-1 h-4">
              {gender}
            </Badge>
          )}
          {declensionClass && (
            <Badge variant="outline" className="text-xs py-0 px-1 h-4">
              {declensionClass}
            </Badge>
          )}
          {conjugationClass && (
            <Badge variant="outline" className="text-xs py-0 px-1 h-4">
              {conjugationClass}
            </Badge>
          )}
          {wordType && (
            <Badge variant="outline" className="text-xs py-0 px-1 h-4">
              {wordType}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-1.5 pt-0 px-3 pb-3">
        {translation && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Translation</h4>
            <p className="text-xs">{translation}</p>
          </div>
        )}

        {definition && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Definition</h4>
            <p className="text-xs">{definition}</p>
          </div>
        )}

        {grammaticalInfo && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Grammar</h4>
            <p className="text-xs font-mono">{grammaticalInfo}</p>
          </div>
        )}

        {principalParts.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Principal Parts</h4>
            <p className="text-xs font-mono">{principalParts.join(', ')}</p>
          </div>
        )}

        {examples.length > 0 && (
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

        {etymology && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Etymology</h4>
            <p className="text-xs text-muted-foreground">{etymology}</p>
          </div>
        )}

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

export default TooltipContent;
