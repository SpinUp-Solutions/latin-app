import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface TableToggleButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
  title: string;
  color: string;
}

export const TableToggleButton: React.FC<TableToggleButtonProps> = ({ isExpanded, onToggle, title, color }) => (
  <button
    type="button"
    onClick={onToggle}
    className={`flex items-center gap-2 text-sm font-medium ${color} hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded px-2 py-1`}
    aria-expanded={isExpanded}
    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${title}`}>
    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    {title}
  </button>
);
