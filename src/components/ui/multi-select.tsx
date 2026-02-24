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
  // Local-only visual state: user explicitly unchecked "All"
  const [uncheckedAll, setUncheckedAll] = React.useState(false);

  const allValues = options.map(o => o.value);
  const isAll = value === 'all';
  const selectedValues = value === 'all' ? (uncheckedAll ? [] : allValues) : value;
  const allChecked = !uncheckedAll && (isAll || selectedValues.length === options.length);

  // Reset local uncheckedAll state when value changes from parent (e.g., POS changed, reset)
  const prevValueRef = React.useRef(value);
  React.useEffect(() => {
    if (prevValueRef.current !== value) {
      setUncheckedAll(false);
      prevValueRef.current = value;
    }
  }, [value]);

  const handleToggle = (optionValue: string) => {
    if (uncheckedAll) {
      // Coming from "unchecked all" state — select just this one option
      setUncheckedAll(false);
      onChange([optionValue]);
      return;
    }

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
    onChange(base.length === options.length ? 'all' : base);
  };

  const handleAllToggle = () => {
    if (allChecked) {
      // Uncheck all — purely visual, since 'all' and 'none' are semantically identical
      setUncheckedAll(true);
    } else {
      setUncheckedAll(false);
      onChange('all');
    }
  };

  const displayText =
    isAll || selectedValues.length === 0
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
            selectedValues.length > 1 && 'h-auto min-h-10',
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
          <div
            className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={handleAllToggle}>
            <span className="absolute left-2 flex h-4 w-4 items-center justify-center pointer-events-none">
              <Checkbox checked={allChecked} tabIndex={-1} />
            </span>
            <span className="font-medium">All</span>
          </div>
          <div className="-mx-1 my-1 h-px bg-muted" />
          {options.map(option => {
            const isChecked = selectedValues.includes(option.value);
            return (
              <div
                key={option.value}
                className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                onClick={() => handleToggle(option.value)}>
                <span className="absolute left-2 flex h-4 w-4 items-center justify-center pointer-events-none">
                  <Checkbox checked={isChecked} tabIndex={-1} />
                </span>
                <span>{option.label}</span>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
