import React from 'react';

interface ArrayCellContentProps {
  value: unknown;
}

export const ArrayCellContent: React.FC<ArrayCellContentProps> = ({ value }) => {
  const arrayValue = Array.isArray(value) ? value : null;

  if (!arrayValue || arrayValue.length === 0) {
    return <span>—</span>;
  }

  return (
    <span className="text-roman-clay">
      {arrayValue.map((form, idx) => (
        <React.Fragment key={idx}>
          {form}
          {idx < arrayValue.length - 1 && ', '}
        </React.Fragment>
      ))}
    </span>
  );
};
