import React from 'react';
import { ANNOTATION_SPECS, ANNOTATION_TOOL_GROUPS, AnnotationKind, normalizeAnnotationTools } from './annotation-spec';
import { Eraser, RotateCcw } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface SentenceDiagramToolbarProps {
  availableTools?: AnnotationKind[];
  activeKinds?: Set<AnnotationKind>;
  disabled?: boolean;
  onToolClick: (kind: AnnotationKind) => void;
  onResetColors: () => void;
  onClear: () => void;
}

const toneClassByKind: Partial<Record<AnnotationKind, string>> = {
  passive: 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100',
  'special-plus-ablative': 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100',
  'subordinate-clause': 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100',
  dative: 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100',
  'prepositional-phrase': 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100',
  ablative: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
  'special-plus-dative': 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100',
  'special-intransitive': 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100',
  'passive-periphrastic': 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100',
};

const activeToneClassByKind: Partial<Record<AnnotationKind, string>> = {
  passive: 'ring-2 ring-blue-400 bg-blue-100',
  'special-plus-ablative': 'ring-2 ring-blue-400 bg-blue-100',
  'subordinate-clause': 'ring-2 ring-blue-400 bg-blue-100',
  dative: 'ring-2 ring-orange-400 bg-orange-100',
  'prepositional-phrase': 'ring-2 ring-orange-400 bg-orange-100',
  ablative: 'ring-2 ring-emerald-400 bg-emerald-100',
  'special-plus-dative': 'ring-2 ring-red-400 bg-red-100',
  'special-intransitive': 'ring-2 ring-red-400 bg-red-100',
  'passive-periphrastic': 'ring-2 ring-red-400 bg-red-100',
};

export const SentenceDiagramToolbar: React.FC<SentenceDiagramToolbarProps> = ({
  availableTools,
  activeKinds,
  disabled = false,
  onToolClick,
  onResetColors,
  onClear,
}) => {
  const visibleTools = new Set(availableTools ? normalizeAnnotationTools(availableTools) : undefined);
  const groups = ANNOTATION_TOOL_GROUPS.map(group => ({
    ...group,
    tools: (availableTools ? group.tools.filter(tool => visibleTools.has(tool)) : group.tools).map(
      tool => ANNOTATION_SPECS[tool]
    ),
  })).filter(group => group.tools.length > 0);

  return (
    <div className="space-y-2">
      {groups.map(group => (
        <div key={group.title} className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400 min-w-[72px]">
            {group.title}
          </span>
          {group.tools.map(tool => {
            const isActive = activeKinds?.has(tool.kind);

            return (
              <button
                key={tool.kind}
                type="button"
                disabled={disabled}
                onMouseDown={event => event.preventDefault()}
                onClick={() => onToolClick(tool.kind)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
                  'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100',
                  disabled && 'cursor-not-allowed opacity-50',
                  !isActive && toneClassByKind[tool.kind],
                  isActive && !activeToneClassByKind[tool.kind] && 'ring-2 ring-stone-400 bg-stone-200',
                  isActive && activeToneClassByKind[tool.kind]
                )}
                title={isActive ? `${tool.label} (applied — click to remove)` : tool.label}>
                {tool.shortLabel}
              </button>
            );
          })}
        </div>
      ))}

      <div className="flex items-center gap-1.5 pt-1 border-t border-stone-100">
        <button
          type="button"
          disabled={disabled}
          onMouseDown={event => event.preventDefault()}
          onClick={onResetColors}
          className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-500 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="Reset colors">
          <Eraser className="h-3 w-3" />
          Reset Colors
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={event => event.preventDefault()}
          onClick={onClear}
          className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-500 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="Clear all">
          <RotateCcw className="h-3 w-3" />
          Clear All
        </button>
      </div>
    </div>
  );
};

export default SentenceDiagramToolbar;
