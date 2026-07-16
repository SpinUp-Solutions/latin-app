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
  Fingerprint,
  Languages,
  Headphones,
} from 'lucide-react';
import type { ComponentType } from 'react';
import {
  CONTENT_TYPE_METADATA,
  EXERCISE_TYPE_METADATA,
  TEST_ELIGIBLE_CONTENT_TYPE_METADATA,
  type ContentType,
} from '@/src/lib/content/registry';

const CONTENT_TYPE_ICONS = {
  text: Type,
  emphasis: Lightbulb,
  table: Table,
  vocabulary: Book,
  'vocabulary-pool': Library,
  matching: Target,
  fill: Target,
  'multiple-choice': CheckSquare,
  'odd-one-out': Filter,
  'text-selection': Search,
  'fill-embolded-text': Zap,
  'sentence-diagramming': Pencil,
  'table-fill': TableProperties,
  'click-on-multiple-words': MousePointerClick,
  'generated-translation': Sparkles,
  'generated-form-identification': Fingerprint,
  'translation-grading': Languages,
  'listening-passage': Headphones,
} satisfies Record<ContentType, ComponentType<{ className?: string }>>;

const withIcon = (metadata: (typeof CONTENT_TYPE_METADATA)[number]) => ({
  type: metadata.type,
  label: metadata.label,
  icon: CONTENT_TYPE_ICONS[metadata.type],
});

export const ALL_CONTENT_TYPES = CONTENT_TYPE_METADATA.map(withIcon);

export const CONTENT_TYPES = CONTENT_TYPE_METADATA.filter(metadata => metadata.kind === 'content')
  .filter(metadata => metadata.type !== 'listening-passage')
  .map(withIcon);

export const SENTENCE_DIAGRAMMING_LESSON_CONTENT_TYPES = CONTENT_TYPE_METADATA.filter(
  metadata => metadata.type === 'sentence-diagramming'
).map(withIcon);

export const EXERCISE_TYPES = EXERCISE_TYPE_METADATA.map(withIcon);

export const TEST_VERSION_CONTENT_TYPES = TEST_ELIGIBLE_CONTENT_TYPE_METADATA.map(withIcon);

export const LISTENING_LESSON_CONTENT_TYPES = CONTENT_TYPE_METADATA.filter(
  metadata => metadata.type === 'listening-passage'
).map(withIcon);
