import { ReactNode } from 'react';
import { TableData } from '../components/ui/page/ConjugationTable';

export interface ContentItem {
  id: string;
  type: string;
  title?: string;
  audioPath?: string | null;
}

export interface TextContent extends ContentItem {
  type: 'text';
  content: string;
}

export interface EmphasisContent extends ContentItem {
  type: 'emphasis';
  content: string;
}

export interface TableContent extends ContentItem {
  type: 'table';
  tableData: TableData;
}

export interface ComponentNarration {
  audioPath?: string | null;
  component: ReactNode;
}
