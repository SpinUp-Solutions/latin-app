import React, { useEffect, useRef } from 'react';
import { cn } from '@/src/lib/utils';

interface ClickableRichDisplayProps {
  content: string;
  onWordClick: (wordIndex: number) => void;
  selectedWordIndex: number | null;
  isCorrect: boolean | null;
  className?: string;
}

export const ClickableRichDisplay: React.FC<ClickableRichDisplayProps> = ({
  content,
  onWordClick,
  selectedWordIndex,
  isCorrect,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    console.log('ClickableRichDisplay - Processing content:', content);

    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    console.log('ClickableRichDisplay - Found text nodes:', textNodes.map(n => n.textContent));

    const wordElements: HTMLSpanElement[] = [];
    let wordIndex = 0;

    textNodes.forEach(textNode => {
      const words = textNode.textContent?.split(/(\s+)/) || [];
      console.log('ClickableRichDisplay - Text node words:', words);
      const fragment = document.createDocumentFragment();

      words.forEach(word => {
        if (word.trim()) {
          const currentWordIndex = wordIndex;
          const span = document.createElement('span');
          span.textContent = word;
          span.className = `cursor-pointer inline-block px-1 py-0.5 mx-0.5 rounded hover:bg-roman-parchment hover:text-roman-red transition-colors`;
          span.dataset.wordIndex = currentWordIndex.toString();

          console.log('ClickableRichDisplay - Creating word span:', { word, wordIndex: currentWordIndex });

          span.addEventListener('click', () => {
            console.log('ClickableRichDisplay - Word clicked:', {
              word,
              wordIndex: currentWordIndex,
              textContent: span.textContent,
              totalWords: content.split(' ').filter(w => w.trim()).length
            });
            onWordClick(currentWordIndex);
          });

          wordElements.push(span);
          fragment.appendChild(span);
          wordIndex++;
        } else if (word) {
          fragment.appendChild(document.createTextNode(word));
        }
      });

      textNode.parentNode?.replaceChild(fragment, textNode);
    });

    console.log('ClickableRichDisplay - Total word elements created:', wordElements.length);

    return () => {
      wordElements.forEach(element => {
        element.removeEventListener('click', () => {});
      });
    };
  }, [content, onWordClick]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const wordSpans = container.querySelectorAll('[data-word-index]');
    wordSpans.forEach((span) => {
      const spanWordIndex = parseInt(span.getAttribute('data-word-index') || '0');
      const isSelected = selectedWordIndex === spanWordIndex;

      span.className = span.className.replace(/bg-(green|red)-\d+|text-(green|red)-\d+/g, '');

      if (isSelected) {
        if (isCorrect) {
          span.className += ' text-green-600 bg-green-50';
        } else {
          span.className += ' text-red-600 bg-red-50';
        }
      }
    });
  }, [selectedWordIndex, isCorrect]);

  return (
    <div
      ref={containerRef}
      className={cn('font-serif text-lg leading-relaxed', className)}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
};

export default ClickableRichDisplay;