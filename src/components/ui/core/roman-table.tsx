import * as React from 'react';
import { cn } from '@/src/lib/utils';

const RomanTable = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-auto">
      <table
        ref={ref}
        className={cn(
          'w-full caption-bottom border-collapse text-sm',
          'bg-roman-parchment border border-roman-terracotta/20 rounded-lg overflow-hidden',
          className
        )}
        {...props}
      />
    </div>
  )
);
RomanTable.displayName = 'RomanTable';

const RomanTableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn('bg-roman-terracotta/10', className)} {...props} />
);
RomanTableHeader.displayName = 'RomanTableHeader';

const RomanTableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn('', className)} {...props} />
);
RomanTableBody.displayName = 'RomanTableBody';

const RomanTableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn('border-t border-roman-terracotta/10 bg-roman-parchment/50', className)}
      {...props}
    />
  )
);
RomanTableFooter.displayName = 'RomanTableFooter';

const RomanTableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn('border-b border-roman-terracotta/10 transition-colors hover:bg-roman-terracotta/5', className)}
      {...props}
    />
  )
);
RomanTableRow.displayName = 'RomanTableRow';

const RomanTableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-10 px-4 text-left align-middle font-serif text-roman-stone',
        'py-3 text-lg font-medium text-roman-terracotta',
        className
      )}
      {...props}
    />
  )
);
RomanTableHead.displayName = 'RomanTableHead';

const RomanTableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <td ref={ref} className={cn('p-4 align-middle font-serif', className)} {...props} />
);
RomanTableCell.displayName = 'RomanTableCell';

const RomanTableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn('mt-4 text-sm text-roman-stone', className)} {...props} />
  )
);
RomanTableCaption.displayName = 'RomanTableCaption';

export {
  RomanTable,
  RomanTableHeader,
  RomanTableBody,
  RomanTableFooter,
  RomanTableHead,
  RomanTableRow,
  RomanTableCell,
  RomanTableCaption,
};
