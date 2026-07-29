'use client';

import { useId, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Tags } from 'lucide-react';
import { Badge } from '@/src/components/ui/badge';
import { Checkbox } from '@/src/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/src/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui/popover';
import { cn } from '@/src/lib/utils';
import type { PracticeTagSummary } from '@/src/types/practice-category';

interface PracticeTagPickerProps {
  tags: PracticeTagSummary[];
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  disabled?: boolean;
  triggerLabel?: string;
  className?: string;
  allowArchivedSelection?: boolean;
  allowNewSelections?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const byTagOrder = (a: PracticeTagSummary, b: PracticeTagSummary) =>
  a.tagOrder - b.tagOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

export function PracticeTagPicker({
  tags,
  selectedTagIds,
  onChange,
  disabled = false,
  triggerLabel = 'Add tags',
  className,
  allowArchivedSelection = false,
  allowNewSelections = true,
  onOpenChange,
}: PracticeTagPickerProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selectedSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);
  const activeTags = useMemo(
    () =>
      tags.filter(tag => tag.status === 'active' && (allowNewSelections || selectedSet.has(tag.id))).sort(byTagOrder),
    [allowNewSelections, selectedSet, tags]
  );
  const archivedTags = useMemo(
    () =>
      tags
        .filter(tag => tag.status === 'archived' && (allowArchivedSelection || selectedSet.has(tag.id)))
        .sort(byTagOrder),
    [allowArchivedSelection, selectedSet, tags]
  );
  const selectedTags = useMemo(() => tags.filter(tag => selectedSet.has(tag.id)).sort(byTagOrder), [selectedSet, tags]);
  const selectableTags = [...activeTags, ...archivedTags];

  const toggle = (tag: PracticeTagSummary) => {
    const nextIds = selectedSet.has(tag.id)
      ? selectedTagIds.filter(tagId => tagId !== tag.id)
      : [...selectedTagIds, tag.id];
    const tagOrder = new Map([...tags].sort(byTagOrder).map((candidate, index) => [candidate.id, index]));
    onChange([...new Set(nextIds)].sort((a, b) => (tagOrder.get(a) ?? 0) - (tagOrder.get(b) ?? 0)));
  };

  return (
    <Popover
      open={open}
      onOpenChange={nextOpen => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
      }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label="Select practice tags"
          disabled={disabled || selectableTags.length === 0}
          className={cn(
            'flex min-h-8 min-w-36 items-center justify-between gap-2 rounded-md border border-input bg-background px-2 py-1 text-left text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}>
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {selectedTags.length === 0 ? (
              <span className="inline-flex items-center gap-1 text-gray-500">
                <Tags className="h-3.5 w-3.5" />
                {selectableTags.length === 0 ? 'No tags defined' : triggerLabel}
              </span>
            ) : (
              <>
                {selectedTags.slice(0, 2).map(tag => (
                  <Badge
                    key={tag.id}
                    variant={tag.status === 'archived' ? 'outline' : 'secondary'}
                    className="max-w-28 px-1.5 py-0 text-[11px] font-normal">
                    <span className="truncate">{tag.name}</span>
                  </Badge>
                ))}
                {selectedTags.length > 2 && <span className="text-gray-500">+{selectedTags.length - 2}</span>}
              </>
            )}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          {selectableTags.length > 8 && <CommandInput placeholder="Search tags…" aria-label="Search tags" />}
          <CommandList id={listId} aria-multiselectable="true">
            <CommandEmpty>No tags found.</CommandEmpty>
            <CommandGroup heading="Tags">
              {activeTags.map(tag => {
                const selected = selectedSet.has(tag.id);
                return (
                  <CommandItem
                    key={tag.id}
                    value={`${tag.name} ${tag.id}`}
                    onSelect={() => toggle(tag)}
                    className="gap-2">
                    <Checkbox checked={selected} tabIndex={-1} className="pointer-events-none" />
                    <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {archivedTags.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Archived assignments">
                  {archivedTags.map(tag => (
                    <CommandItem
                      key={tag.id}
                      value={`${tag.name} ${tag.id} archived`}
                      onSelect={() => toggle(tag)}
                      className="gap-2 text-gray-500">
                      <Checkbox checked={selectedSet.has(tag.id)} tabIndex={-1} className="pointer-events-none" />
                      <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                      <Badge variant="outline" className="px-1 py-0 text-[10px]">
                        Archived
                      </Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
          <div className="border-t px-3 py-2 text-xs text-gray-500">
            {selectedTagIds.length === 0
              ? 'All lessons in this category'
              : `${selectedTagIds.length} ${selectedTagIds.length === 1 ? 'tag' : 'tags'} selected`}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
