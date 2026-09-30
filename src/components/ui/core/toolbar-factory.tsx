import React from 'react';
import { Editor } from '@tiptap/react';
import { LucideIcon } from 'lucide-react';

interface ToolbarButton {
  type: string;
  icon: LucideIcon;
  title: string;
  isActive?: boolean;
  action?: () => void;
}

export interface ToolbarSection {
  title: string;
  items: ToolbarButton[];
}

export const ToolbarFactory: React.FC<{ sections: ToolbarSection[]; editor: Editor }> = ({ sections, editor }) => (
  <div className="border-b border-gray-300 p-2 bg-gray-50 space-y-2">
    {sections.map((section, sectionIndex) => (
      <div key={sectionIndex} className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-600 min-w-[120px]">{section.title}:</span>
        <div className="flex items-center gap-1">
          {section.items.map((button, buttonIndex) => {
            const isActive = button.isActive ?? editor.isActive(button.type);
            return (
              <button
                key={buttonIndex}
                type="button"
                onClick={() => button.action?.()}
                className={`p-2 rounded hover:bg-gray-200 transition-colors ${
                  isActive ? 'bg-blue-200 border-blue-400' : 'bg-white border-gray-300'
                } cursor-pointer border text-sm font-medium`}
                title={button.title}>
                <button.icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </div>
    ))}
  </div>
);
