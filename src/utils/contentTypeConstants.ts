import { Type, Lightbulb, Table, Book, Target, Search, Zap, Users, FileText, Pencil, CheckSquare, Filter } from 'lucide-react';

export const CONTENT_TYPES = [
  { type: 'text', icon: Type, label: 'Text Block' },
  { type: 'emphasis', icon: Lightbulb, label: 'Emphasis' },
  { type: 'table', icon: Table, label: 'Table' },
  { type: 'vocabulary', icon: Book, label: 'Vocabulary' },
] as const;

export const EXERCISE_TYPES = [
  // Exercise-specific types
  { type: 'matching', icon: Target, label: 'Matching' },
  { type: 'fill', icon: Target, label: 'Fill-in-Blank' },
  { type: 'multiple-choice', icon: CheckSquare, label: 'Multiple Choice' },
  { type: 'odd-one-out', icon: Filter, label: 'Odd One Out' },
  { type: 'text-selection', icon: Search, label: 'Text Selection' },
  { type: 'verb-analysis', icon: Zap, label: 'Verb Analysis' },
  { type: 'verb-conjugation', icon: Users, label: 'Verb Conjugation' },
  { type: 'sentence-diagramming', icon: Pencil, label: 'Sentence Diagramming' },
  // Content types also available in exercises
  { type: 'text', icon: FileText, label: 'Text Block' },
  { type: 'emphasis', icon: Lightbulb, label: 'Emphasis' },
  { type: 'table', icon: Table, label: 'Table' },
  { type: 'vocabulary', icon: Book, label: 'Vocabulary' },
] as const;
