'use client';

import React from 'react';

interface TextComponentProps {
  title: string;
  content: string;
  className?: string;
}

export const TextComponent: React.FC<TextComponentProps> = ({ title, content, className = '' }) => {
  return (
    <div className={`text-component ${className}`}>
      <h3 className="text-lg font-serif text-roman-red mb-2">{title}</h3>
      <div
        className="p-4 bg-roman-parchment rounded-lg prose dark:prose-invert max-w-none prose-p:my-2 prose-p:leading-snug prose-headings:my-4 prose-ul:my-2 prose-ol:my-2"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
};

export default TextComponent;
