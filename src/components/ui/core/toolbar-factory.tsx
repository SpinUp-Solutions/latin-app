import React from 'react';
import { Editor } from '@tiptap/react';
import { LucideIcon } from 'lucide-react';

export interface ToolbarButton {
  type: string;
  icon: LucideIcon;
  title: string;
  isActive?: boolean;
  action?: () => void;
  canExecute?: () => boolean;
  className?: string;
}

export interface ToolbarSection {
  title: string;
  items: ToolbarButton[];
}

export interface ToolbarConfig {
  sections: ToolbarSection[];
  className?: string;
  disabled?: boolean;
}

interface ToolbarFactoryProps {
  config: ToolbarConfig;
  editor: Editor;
  onButtonClick?: (type: string, button: ToolbarButton) => void;
}

export const ToolbarFactory: React.FC<ToolbarFactoryProps> = ({
  config,
  editor,
  onButtonClick,
}) => {
  const getButtonClass = (isActive: boolean, customClass?: string) => {
    const baseClass = `
      p-2 rounded hover:bg-gray-200 transition-colors
      ${isActive ? 'bg-blue-200 border-blue-400' : 'bg-white border-gray-300'}
      ${config.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      border text-sm font-medium
    `;
    return customClass ? `${baseClass} ${customClass}` : baseClass;
  };

  const handleButtonClick = (button: ToolbarButton) => {
    if (config.disabled) return;
    
    if (button.action) {
      button.action();
    } else if (onButtonClick) {
      onButtonClick(button.type, button);
    }
  };

  const isButtonDisabled = (button: ToolbarButton) => {
    if (config.disabled) return true;
    if (button.canExecute) return !button.canExecute();
    return false;
  };

  return (
    <div className={`border-b border-gray-300 p-2 bg-gray-50 space-y-2 ${config.className || ''}`}>
      {config.sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 min-w-[120px]">
            {section.title}:
          </span>
          <div className="flex items-center gap-1">
            {section.items.map((button, buttonIndex) => {
              const isActive = button.isActive ?? editor.isActive(button.type);
              const disabled = isButtonDisabled(button);
              
              return (
                <button
                  key={buttonIndex}
                  type="button"
                  onClick={() => handleButtonClick(button)}
                  className={getButtonClass(isActive, button.className)}
                  title={button.title}
                  disabled={disabled}
                >
                  <button.icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export const useToolbarFactory = () => {
  const createButton = (
    type: string,
    icon: LucideIcon,
    title: string,
    options: Partial<ToolbarButton> = {}
  ): ToolbarButton => ({
    type,
    icon,
    title,
    ...options,
  });

  const createSection = (title: string, items: ToolbarButton[]): ToolbarSection => ({
    title,
    items,
  });

  const createConfig = (
    sections: ToolbarSection[],
    options: Partial<ToolbarConfig> = {}
  ): ToolbarConfig => ({
    sections,
    ...options,
  });

  return {
    createButton,
    createSection,
    createConfig,
  };
};