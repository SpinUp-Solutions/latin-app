'use client';

import * as React from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/src/components/ui/popover';
import { Checkbox } from '@/src/components/ui/checkbox';
import { Badge } from '@/src/components/ui/badge';
import { cn } from '@/src/lib/utils';
import { ChevronDown } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[] | 'all';
  onChange: (value: string[] | 'all') => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({ options, value, onChange, placeholder = 'All', className }: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const allValues = options.map(o => o.value);
  const isAll = value === 'all' || (Array.isArray(value) && value.length === 0);
  const selectedValues = isAll ? allValues : value;
  const allChecked = isAll || selectedValues.length === options.length;

  const handleToggle = (optionValue: string) => {
    let base: string[];
    if (isAll) {
      // Transition from 'all' to explicit array: remove the unchecked item
      base = allValues.filter(v => v !== optionValue);
    } else if (selectedValues.includes(optionValue)) {
      base = selectedValues.filter(v => v !== optionValue);
    } else {
      base = [...selectedValues, optionValue];
    }

    // If all options are now selected, emit 'all'
    onChange(base.length === options.length ? 'all' : base.length === 0 ? 'all' : base);
  };

  const handleAllToggle = () => {
    if (allChecked) {
      // Deselect all → emit 'all' (no filter = same as all)
      // But to give visual feedback, we do nothing since unchecked-all = all semantically
      // Instead, just keep 'all'
      return;
    }
    onChange('all');
  };

  const displayText = isAll
    ? placeholder
    : selectedValues.length === 1
      ? options.find(o => o.value === selectedValues[0])?.label || selectedValues[0]
      : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            !displayText && !isAll && 'h-auto min-h-10',
            className
          )}>
          <div className="flex flex-wrap gap-1 items-center [&>span]:line-clamp-1">
            {displayText ? (
              <span>{displayText}</span>
            ) : (
              selectedValues.map(val => {
                const label = options.find(o => o.value === val)?.label || val;
                return (
                  <Badge key={val} variant="secondary" className="text-xs font-normal">
                    {label}
                  </Badge>
                );
              })
            )}
          </div>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] rounded-md border bg-white p-1 shadow-md"
        align="start">
        <div>
          <label
            className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={handleAllToggle}>
            <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
              <Checkbox checked={allChecked} onCheckedChange={() => handleAllToggle()} />
            </span>
            <span className="font-medium">All</span>
          </label>
          <div className="-mx-1 my-1 h-px bg-muted" />
          {options.map(option => {
            const isChecked = selectedValues.includes(option.value);
            return (
              <label
                key={option.value}
                className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground">
                <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                  <Checkbox checked={isChecked} onCheckedChange={() => handleToggle(option.value)} />
                </span>
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
