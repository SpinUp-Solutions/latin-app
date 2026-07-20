'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { ChevronLeft, ChevronRight, BookOpen, Grid3X3 } from 'lucide-react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { SimpleRichDisplay } from '../core/simple-rich-display';

export interface VocabularyStudyItem {
  id: string;
  latin: string;
  english: string;
  pronunciation?: string | null;
  audioPath?: string | null;
  example?: string;
  partOfSpeech?: string;
  notes?: string;
}

interface VocabularyStudyViewProps {
  title: string;
  subtitle: string;
  items: VocabularyStudyItem[];
  audioPath?: string | null;
  defaultMode?: 'flashcards' | 'list';
  showPronunciation?: boolean;
  showNotes?: boolean;
}

export function VocabularyStudyView({
  title,
  subtitle,
  items,
  audioPath,
  defaultMode = 'flashcards',
  showPronunciation = true,
  showNotes = true,
}: VocabularyStudyViewProps) {
  const [currentMode, setCurrentMode] = useState<'flashcards' | 'list'>(defaultMode);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    if (currentCardIndex >= items.length) {
      setCurrentCardIndex(0);
      setIsFlipped(false);
    }
  }, [items.length, currentCardIndex]);

  if (items.length === 0) {
    return null;
  }

  const currentItem = items[currentCardIndex];

  const nextCard = () => {
    if (currentCardIndex < items.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      setIsFlipped(false);
    }
  };

  const prevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
      setIsFlipped(false);
    }
  };

  const handleCardClick = () => {
    setIsFlipped(!isFlipped);
  };

  const FlashcardView = () => {
    if (!currentItem) {
      return (
        <div className="text-center p-8">
          <p className="text-gray-500">No vocabulary item found.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center">
          <span className="text-sm text-roman-stone">
            {currentCardIndex + 1} of {items.length}
          </span>
        </div>

        <div className="flex justify-center">
          <div className="w-full max-w-md">
            <RomanCard className="cursor-pointer select-none h-48" onClick={handleCardClick}>
              <RomanCardContent className="h-full flex flex-col items-center justify-center p-3">
                {!isFlipped ? (
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-serif text-roman-red">
                      <SimpleRichDisplay content={currentItem.latin} />
                    </h3>
                    {showPronunciation && currentItem.pronunciation && (
                      <div className="text-xs text-roman-stone italic">
                        /<SimpleRichDisplay content={currentItem.pronunciation} />/
                      </div>
                    )}
                    {currentItem.audioPath && (
                      <AudioPlayButton audioPath={currentItem.audioPath} variant="vocabulary" size="sm" />
                    )}
                    <div className="pt-2">
                      <p className="text-xs text-roman-stone">Click to reveal meaning</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-2">
                    <h3 className="text-lg font-medium text-gray-800">
                      <SimpleRichDisplay content={currentItem.english} />
                    </h3>
                    {currentItem.partOfSpeech && (
                      <Badge variant="secondary" className="text-xs">
                        <SimpleRichDisplay content={currentItem.partOfSpeech} />
                      </Badge>
                    )}
                    {currentItem.example && (
                      <div className="text-xs text-roman-stone italic">
                        &ldquo;
                        <SimpleRichDisplay content={currentItem.example} />
                        &rdquo;
                      </div>
                    )}
                    {showNotes && currentItem.notes && (
                      <div className="text-xs text-roman-stone">
                        <SimpleRichDisplay content={currentItem.notes} />
                      </div>
                    )}
                    <div className="pt-2">
                      <p className="text-xs text-roman-stone">Click to see Latin word</p>
                    </div>
                  </div>
                )}
              </RomanCardContent>
            </RomanCard>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={prevCard} disabled={currentCardIndex === 0}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-roman-stone">
              Card {currentCardIndex + 1} of {items.length}
            </span>
          </div>

          <Button variant="outline" onClick={nextCard} disabled={currentCardIndex === items.length - 1}>
            Next
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  };

  const ListView = () => (
    <div className="space-y-4">
      {items.map(item => (
        <RomanCard key={item.id}>
          <RomanCardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-serif text-roman-red">
                  <SimpleRichDisplay content={item.latin} />
                </h3>
                {showPronunciation && item.pronunciation && (
                  <span className="text-sm text-roman-stone italic">
                    /<SimpleRichDisplay content={item.pronunciation} />/
                  </span>
                )}
                {item.audioPath && <AudioPlayButton audioPath={item.audioPath} variant="vocabulary" size="sm" />}
              </div>
              <div className="text-lg text-gray-800">
                <SimpleRichDisplay content={item.english} />
              </div>
              <div className="flex items-center gap-2">
                {item.partOfSpeech && (
                  <Badge variant="secondary">
                    <SimpleRichDisplay content={item.partOfSpeech} />
                  </Badge>
                )}
              </div>
              {item.example && (
                <div className="text-sm text-roman-stone italic">
                  &ldquo;
                  <SimpleRichDisplay content={item.example} />
                  &rdquo;
                </div>
              )}
              {showNotes && item.notes && (
                <div className="text-xs text-roman-stone">
                  <SimpleRichDisplay content={item.notes} />
                </div>
              )}
            </div>
          </RomanCardContent>
        </RomanCard>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex justify-center items-center gap-4">
          <div>
            <h2 className="text-2xl font-serif text-gray-800">
              <SimpleRichDisplay content={title} />
            </h2>
            <p className="text-roman-stone">{subtitle}</p>
          </div>
          {audioPath && (
            <AudioPlayButton
              audioPath={audioPath}
              variant="default"
              size="sm"
              className="rounded-full border-roman-terracotta/20 hover:border-roman-terracotta hover:bg-roman-parchment"
            />
          )}
        </div>
      </div>

      <Tabs value={currentMode} onValueChange={value => setCurrentMode(value as 'flashcards' | 'list')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="flashcards" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Flashcards
          </TabsTrigger>
          <TabsTrigger value="list" className="flex items-center gap-2">
            <Grid3X3 className="h-4 w-4" />
            List View
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flashcards" className="mt-6">
          <FlashcardView />
        </TabsContent>
        <TabsContent value="list" className="mt-6">
          <ListView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
