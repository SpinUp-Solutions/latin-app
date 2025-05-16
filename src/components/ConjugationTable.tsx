'use client';

import React from 'react';
import {
  RomanTable,
  RomanTableHeader,
  RomanTableBody,
  RomanTableRow,
  RomanTableHead,
  RomanTableCell,
  RomanTableCaption,
} from './ui/roman-table';

export interface Column {
  id: string;
  header: string;
  className?: string;
}

export interface TableRow {
  id: string;
  cells: Record<string, string>;
  rowHeader?: string;
}

export interface TableData {
  title?: string;
  caption?: string;
  columns: Column[];
  rows: TableRow[];
}

interface ConjugationTableProps {
  data: TableData;
  className?: string;
}

const ConjugationTable: React.FC<ConjugationTableProps> = ({ data, className }) => {
  return (
    <div className={className}>
      {data.title && <h3 className="text-lg font-serif text-roman-red mb-2">{data.title}</h3>}

      <RomanTable>
        <RomanTableHeader>
          <RomanTableRow>
            {data.rows.some(row => row.rowHeader !== undefined) && <RomanTableHead></RomanTableHead>}
            {data.columns.map(column => (
              <RomanTableHead key={column.id} className={column.className}>
                {column.header}
              </RomanTableHead>
            ))}
          </RomanTableRow>
        </RomanTableHeader>
        <RomanTableBody>
          {data.rows.map(row => (
            <RomanTableRow key={row.id}>
              {row.rowHeader && <RomanTableHead>{row.rowHeader}</RomanTableHead>}
              {data.columns.map(column => (
                <RomanTableCell key={`${row.id}-${column.id}`} className={column.className}>
                  {row.cells[column.id] || ''}
                </RomanTableCell>
              ))}
            </RomanTableRow>
          ))}
        </RomanTableBody>
        {data.caption && <RomanTableCaption>{data.caption}</RomanTableCaption>}
      </RomanTable>
    </div>
  );
};

export default ConjugationTable;
