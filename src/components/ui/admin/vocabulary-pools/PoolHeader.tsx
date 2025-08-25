import React from 'react';
import { Library } from 'lucide-react';

interface PoolHeaderProps {
  title: string;
  subtitle?: string;
  navigation?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PoolHeader: React.FC<PoolHeaderProps> = ({
  title,
  subtitle,
  navigation,
  actions
}) => {
  return (
    <header className="bg-white border-b border-border">
      <div className="container mx-auto px-4 py-3">
        {navigation && (
          <div className="mb-4">
            {navigation}
          </div>
        )}
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <Library className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-wide">{title}</h1>
              {subtitle && (
                <p className="text-sm text-roman-stone">{subtitle}</p>
              )}
            </div>
          </div>
          
          {actions && (
            <div className="flex items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};