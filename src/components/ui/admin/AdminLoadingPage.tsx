import React from 'react';

export const AdminLoadingPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-roman-marble">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
    </div>
  );
};