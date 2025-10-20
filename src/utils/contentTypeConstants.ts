import {
  Type,
  Lightbulb,
  Table,
  Book,
  Library,
  Target,
  Search,
  Zap,
  Pencil,
  CheckSquare,
  Filter,
  TableProperties,
  MousePointerClick,
  Sparkles,
} from 'lucide-react';

export const ALL_CONTENT_TYPES = [
  { type: 'text', icon: Type, label: 'Text Block' },
  { type: 'emphasis', icon: Lightbulb, label: 'Emphasis' },
  { type: 'table', icon: Table, label: 'Table' },
  { type: 'vocabulary', icon: Book, label: 'Vocabulary' },
  { type: 'vocabulary-pool', icon: Library, label: 'Vocabulary Pool' },
  { type: 'matching', icon: Target, label: 'Matching' },
  { type: 'fill', icon: Target, label: 'Fill-in-Blank' },
  { type: 'multiple-choice', icon: CheckSquare, label: 'Multiple Choice' },
  { type: 'odd-one-out', icon: Filter, label: 'Odd One Out' },
  { type: 'text-selection', icon: Search, label: 'Text Selection' },
  { type: 'fill-embolded-text', icon: Zap, label: 'Fill In Embolded Text' },
  { type: 'sentence-diagramming', icon: Pencil, label: 'Sentence Diagramming' },
  { type: 'table-fill', icon: TableProperties, label: 'Table Fill Exercise' },
  { type: 'click-on-multiple-words', icon: MousePointerClick, label: 'Click On Multiple Words' },
  { type: 'generated-translation', icon: Sparkles, label: 'Generated Translation Exercise' },
] as const;

export const CONTENT_TYPES = [
  { type: 'text', icon: Type, label: 'Text Block' },
  { type: 'emphasis', icon: Lightbulb, label: 'Emphasis' },
  { type: 'table', icon: Table, label: 'Table' },
  { type: 'vocabulary', icon: Book, label: 'Vocabulary' },
  { type: 'vocabulary-pool', icon: Library, label: 'Vocabulary Pool' },
] as const;

export const EXERCISE_TYPES = [
  { type: 'matching', icon: Target, label: 'Matching' },
  { type: 'fill', icon: Target, label: 'Fill-in-Blank' },
  { type: 'multiple-choice', icon: CheckSquare, label: 'Multiple Choice' },
  { type: 'odd-one-out', icon: Filter, label: 'Odd One Out' },
  { type: 'text-selection', icon: Search, label: 'Text Selection' },
  { type: 'fill-embolded-text', icon: Zap, label: 'Fill In Embolded Text' },
  { type: 'sentence-diagramming', icon: Pencil, label: 'Sentence Diagramming' },
  { type: 'table-fill', icon: TableProperties, label: 'Table Fill Exercise' },
  { type: 'click-on-multiple-words', icon: MousePointerClick, label: 'Click On Multiple Words' },
  { type: 'generated-translation', icon: Sparkles, label: 'Generated Translation Exercise' },
] as const;
