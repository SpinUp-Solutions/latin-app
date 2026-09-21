'use client';

import { CalendarIcon } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Calendar } from '@/src/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui/popover';
import { cn } from '@/src/lib/utils';

export function DateOfBirthField({
  value,
  onChange,
  open,
  onOpenChange,
}: {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('w-full justify-start text-left font-normal bg-background', !value && 'text-muted-foreground')}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value
            ? value.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
            : 'Date of birth'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-transparent border-none shadow-none" align="start">
        <Calendar
          variant="dob"
          selected={value}
          onSelect={onChange}
          disabled={date => date > new Date()}
          onClose={() => onOpenChange(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
