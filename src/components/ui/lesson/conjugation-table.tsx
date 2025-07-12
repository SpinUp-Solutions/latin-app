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
} from '../core/roman-table';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';

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
  audioPath?: string | null;
}

const ConjugationTable: React.FC<ConjugationTableProps> = ({ data, className, audioPath }) => {
  return (
    <div className={className}>
      <div className="flex justify-between items-start mb-2">
        {data.title && <h3 className="text-lg font-serif text-roman-red">{data.title}</h3>}
        {audioPath && (
          <AudioPlayButton
            audioPath={audioPath}
            variant="default"
            size="sm"
            className="ml-2 rounded-full border-roman-terracotta/20 hover:border-roman-terracotta hover:bg-roman-parchment"
          />
        )}
      </div>

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
