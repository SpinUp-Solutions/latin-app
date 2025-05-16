'use client';

import React from 'react';
import { ComponentNarration } from '@/src/types/lesson';

interface IntroComponentProps {
  title: string;
  content: React.ReactNode;
  className?: string;
}

export const IntroComponent: React.FC<IntroComponentProps> = ({ title, content, className = '' }) => {
  return (
    <div className={`intro-component ${className}`}>
      <h3 className="text-lg font-serif text-roman-red mb-2">{title}</h3>
      <div className="p-4 bg-roman-parchment rounded-lg">{content}</div>
    </div>
  );
};

export default IntroComponent;
