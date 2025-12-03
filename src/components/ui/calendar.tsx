'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker, type DayPickerProps } from 'react-day-picker';
import { cn } from '@/src/lib/utils';
import { buttonVariants } from '@/src/components/ui/button';
import { ScrollArea } from '@/src/components/ui/scroll-area';

export type CalendarProps = DayPickerProps & {
  variant?: 'default' | 'dob';
  onClose?: () => void;
};

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  variant = 'default',
  onClose,
  ...props
}: CalendarProps) {
  if (variant === 'dob') {
    return <DOBCalendar className={className} onClose={onClose} {...props} />;
  }

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-5 bg-white rounded-xl border border-border/50 shadow-xl', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
        month: 'space-y-3',
        month_caption: 'flex justify-center pt-1 relative items-center mb-5',
        caption_label: 'text-lg font-bold font-serif text-roman-red',
        nav: 'space-x-1 flex items-center',
        button_previous: cn(
          buttonVariants({ variant: 'outline' }),
          'h-8 w-8 bg-transparent p-0 border-roman-red/20 hover:border-roman-red hover:bg-roman-red/5 hover:text-roman-red transition-all absolute left-1'
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline' }),
          'h-8 w-8 bg-transparent p-0 border-roman-red/20 hover:border-roman-red hover:bg-roman-red/5 hover:text-roman-red transition-all absolute right-1'
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex mb-1',
        weekday: 'text-roman-red/70 w-[calc(100%/7)] font-semibold text-xs uppercase tracking-wider text-center pb-2',
        week: 'flex w-full mb-0.5',
        day: 'w-[calc(100%/7)] text-center p-0 relative focus-within:relative focus-within:z-20',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-full p-0 font-normal aria-selected:opacity-100 rounded-md transition-all hover:bg-roman-red/10 hover:text-roman-red'
        ),
        range_end: 'day-range-end',
        selected:
          '[&>button]:bg-roman-red [&>button]:text-white [&>button]:hover:bg-roman-red/90 [&>button]:font-semibold [&>button]:shadow-sm',
        today:
          '[&>button]:bg-roman-red/10 [&>button]:text-roman-red [&>button]:font-bold [&>button]:border [&>button]:border-roman-red/30',
        outside: 'text-muted-foreground opacity-40',
        disabled: 'text-muted-foreground opacity-30 cursor-not-allowed [&>button]:hover:bg-transparent',
        range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          if (orientation === 'left') {
            return <ChevronLeft className="h-4 w-4" />;
          }
          return <ChevronRight className="h-4 w-4" />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

function DOBCalendar(props: Omit<CalendarProps, 'variant'>) {
  const { className, onClose, defaultMonth, disabled, ...dayPickerProps } = props;
  const selected = 'selected' in props ? (props.selected as Date | undefined) : undefined;
  const onSelect = 'onSelect' in props ? (props.onSelect as (date: Date | undefined) => void) : undefined;
  const [view, setView] = React.useState<'calendar' | 'months' | 'years'>('years');
  const [month, setMonth] = React.useState<Date>(selected || defaultMonth || new Date(2000, 0));

  React.useEffect(() => {
    if (selected) {
      setMonth(selected);
    }
  }, [selected]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1900 + 1 }, (_, i) => currentYear - i);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthNamesFull = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const handleYearSelect = (year: number) => {
    const newMonth = new Date(month);
    newMonth.setFullYear(year);
    setMonth(newMonth);
    setView('months');
  };

  const handleMonthSelect = (monthIndex: number) => {
    const newMonth = new Date(month);
    newMonth.setMonth(monthIndex);
    setMonth(newMonth);
    setView('calendar');
  };

  const handleDaySelect = (date: Date | undefined) => {
    if (onSelect) {
      onSelect(date);
    }
    if (date) {
      setMonth(date);
    }
  };

  const formatSelectedDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  return (
    <div className={cn('w-[340px] bg-white rounded-2xl shadow-2xl overflow-hidden', className)}>
      <div className="px-5 pt-5 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setView('years')}
            className={cn(
              'text-sm font-medium px-3 py-1.5 rounded-full transition-all',
              view === 'years' ? 'bg-roman-red text-white' : 'text-gray-600 hover:bg-gray-100'
            )}>
            {month.getFullYear()}
          </button>
          <button
            onClick={() => setView('months')}
            className={cn(
              'text-sm font-medium px-3 py-1.5 rounded-full transition-all',
              view === 'months' ? 'bg-roman-red text-white' : 'text-gray-600 hover:bg-gray-100'
            )}>
            {monthNamesFull[month.getMonth()]}
          </button>
          {view === 'calendar' && (
            <div className="flex gap-1">
              <button
                onClick={() => {
                  const newMonth = new Date(month);
                  newMonth.setMonth(newMonth.getMonth() - 1);
                  setMonth(newMonth);
                }}
                className="h-8 w-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  const newMonth = new Date(month);
                  newMonth.setMonth(newMonth.getMonth() + 1);
                  setMonth(newMonth);
                }}
                className="h-8 w-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {selected && (
          <p className="text-xs text-gray-500">
            Selected: <span className="font-medium text-roman-red">{formatSelectedDate(selected)}</span>
          </p>
        )}
      </div>

      <div className="h-[300px] overflow-hidden">
        {view === 'years' && (
          <ScrollArea className="h-full">
            <div className="grid grid-cols-4 gap-2 p-4">
              {years.map(year => (
                <button
                  key={year}
                  onClick={() => handleYearSelect(year)}
                  className={cn(
                    'py-2.5 text-sm rounded-lg transition-all font-medium',
                    year === month.getFullYear()
                      ? 'bg-roman-red text-white shadow-sm'
                      : 'text-gray-700 hover:bg-roman-red/10 hover:text-roman-red'
                  )}>
                  {year}
                </button>
              ))}
            </div>
          </ScrollArea>
        )}

        {view === 'months' && (
          <div className="grid grid-cols-3 gap-3 p-5">
            {monthNames.map((m, index) => (
              <button
                key={m}
                onClick={() => handleMonthSelect(index)}
                className={cn(
                  'py-4 text-sm rounded-xl transition-all font-medium',
                  index === month.getMonth()
                    ? 'bg-roman-red text-white shadow-sm'
                    : 'text-gray-700 hover:bg-roman-red/10 hover:text-roman-red border border-gray-100'
                )}>
                {m}
              </button>
            ))}
          </div>
        )}

        {view === 'calendar' && (
          <div className="p-4">
            <DayPicker
              {...dayPickerProps}
              mode="single"
              selected={selected}
              onSelect={handleDaySelect}
              month={month}
              onMonthChange={setMonth}
              showOutsideDays={true}
              disabled={disabled}
              hideNavigation
              className="m-0"
              classNames={{
                months: 'w-full',
                month: 'w-full',
                month_caption: 'hidden',
                month_grid: 'w-full border-collapse',
                weekdays: 'flex mb-2',
                weekday: 'text-gray-400 w-[calc(100%/7)] font-medium text-xs text-center',
                week: 'flex w-full',
                day: 'h-10 w-[calc(100%/7)] text-center text-sm p-0.5',
                day_button:
                  'h-full w-full rounded-lg font-medium transition-all hover:bg-roman-red/10 hover:text-roman-red',
                selected:
                  '[&>button]:bg-roman-red [&>button]:text-white [&>button]:hover:bg-roman-red/90 [&>button]:shadow-sm',
                today: '[&>button]:ring-2 [&>button]:ring-roman-red/30 [&>button]:text-roman-red [&>button]:font-bold',
                outside: '[&>button]:text-gray-300',
                disabled: '[&>button]:text-gray-200 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent',
                hidden: 'invisible',
              }}
            />
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center">
        <button
          onClick={() => {
            const today = new Date();
            setMonth(today);
            if (onSelect) onSelect(today);
          }}
          className="text-sm font-medium text-gray-600 hover:text-roman-red transition-colors">
          Today
        </button>
        <button
          onClick={onClose}
          className="px-5 py-2 text-sm font-semibold text-white bg-roman-red hover:bg-roman-red/90 rounded-lg transition-colors shadow-sm">
          Done
        </button>
      </div>
    </div>
  );
}

export { Calendar };
