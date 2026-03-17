'use client';

import React, { useState, useEffect } from 'react';
import { X, MessageSquare } from 'lucide-react';

const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScuJEcipD4D1htH1m-VL0zyZj4H-NAydOM-Syn6e-DZ75M7zQ/viewform';
const DISMISSED_KEY = 'feedback_banner_dismissed';

interface FeedbackBannerProps {
  className?: string;
}

export const FeedbackBanner: React.FC<FeedbackBannerProps> = ({ className = '' }) => {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true');
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  if (dismissed === null || dismissed) return null;

  return (
    <div
      className={`bg-roman-parchment border-b border-roman-terracotta/20 px-6 py-3 flex items-center justify-between gap-4 ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        <MessageSquare className="h-4 w-4 text-roman-red flex-shrink-0" />
        <p className="text-sm text-roman-stone">
          How is your Latin learning experience?{' '}
          <a
            href={FEEDBACK_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-roman-red hover:underline">
            Share your feedback
          </a>{' '}
          — it only takes a minute.
        </p>
      </div>
      <button
        onClick={handleDismiss}
        className="text-roman-stone/50 hover:text-roman-red transition-colors flex-shrink-0"
        aria-label="Dismiss feedback banner">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
