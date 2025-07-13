import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface TooltipData {
  id: string;
  word: string;
  translation?: string;
  pronunciation?: string;
  partOfSpeech?: string;
  wordType?: string;
  definition?: string;
  examples?: string[];
  etymology?: string;
}

interface TooltipContextType {
  tooltips: Record<string, TooltipData>;
  addTooltip: (id: string, data: Omit<TooltipData, 'id'>) => void;
  removeTooltip: (id: string) => void;
  getTooltip: (id: string) => TooltipData | undefined;
  clearTooltips: () => void;
}

const TooltipContext = createContext<TooltipContextType | undefined>(undefined);

export const useTooltips = () => {
  const context = useContext(TooltipContext);
  if (!context) {
    throw new Error('useTooltips must be used within a TooltipProvider');
  }
  return context;
};

interface TooltipProviderProps {
  children: ReactNode;
}

export const TooltipProvider: React.FC<TooltipProviderProps> = ({ children }) => {
  const [tooltips, setTooltips] = useState<Record<string, TooltipData>>({});

  const addTooltip = (id: string, data: Omit<TooltipData, 'id'>) => {
    setTooltips(prev => ({
      ...prev,
      [id]: { ...data, id },
    }));
  };

  const removeTooltip = (id: string) => {
    setTooltips(prev => {
      const newTooltips = { ...prev };
      delete newTooltips[id];
      return newTooltips;
    });
  };

  const getTooltip = (id: string) => {
    return tooltips[id];
  };

  const clearTooltips = () => {
    setTooltips({});
  };

  return (
    <TooltipContext.Provider
      value={{
        tooltips,
        addTooltip,
        removeTooltip,
        getTooltip,
        clearTooltips,
      }}>
      {children}
    </TooltipContext.Provider>
  );
};

//TODO: MAKE SURE STATE MAANAGMENT FOR TOOLTIPS IS OK (MIGHT BE ABLE TO USE SLICE ETC)
