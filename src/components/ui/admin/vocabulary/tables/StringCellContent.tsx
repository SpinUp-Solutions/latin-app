import React from 'react';

interface StringCellContentProps {
  value: unknown;
}

export const StringCellContent: React.FC<StringCellContentProps> = ({ value }) => {
  const stringValue = typeof value === 'string' ? value : null;
  return <span className="text-roman-clay">{stringValue || '—'}</span>;
};
