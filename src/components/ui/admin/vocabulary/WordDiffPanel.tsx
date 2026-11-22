import { WORD_FIELD_ROWS, WORD_FIELDS, type WordFieldName } from '@/src/components/ui/admin/vocabulary/wordFields';
import { WordFieldLayout } from '@/src/components/ui/admin/vocabulary/forms/WordFieldLayout';
import React, { createContext, useContext, useMemo, useState } from 'react';
import { Label } from '@/src/components/ui/label';
import { Switch } from '@/src/components/ui/switch';
import { cn } from '@/src/lib/utils';
import type { PronounPerson, PronounType } from '@/shared/types/vocabulary/schemas/enums';
import { formatEnumLabel } from '@/src/utils/schema-helpers';
import {
  changedTableCells,
  changedWordFields,
  sameWordValue,
  summarizeWordChanges,
} from '@/src/utils/vocabulary/word-diff';
import { MarkedText } from './MarkedText';
import { ArrayCellContent } from './tables/ArrayCellContent';
import { SchemaTable } from './tables/SchemaTable';
import { getEditableTable, getPronounTableSchema, getPronounTableTitle } from './wordTables';
import { buildEmptyFromSchema } from '@/src/utils/schema-defaults';

type Plain = Record<string, unknown>;

interface WordDiffPanelProps {
  /** The word before the change. Omit to show a single, read-only snapshot. */
  before?: Plain;
  /** The word after the change. */
  after: Plain;
  /** What the "before" side is called, such as "Current". */
  beforeLabel?: string;
  afterLabel?: string;
  actions?: React.ReactNode;
}

const DiffContext = createContext<{ before: Plain; after: Plain; changesOnly: boolean }>({
  before: {},
  after: {},
  changesOnly: false,
});

const asText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, entry]) => `${key}: ${asText(entry) || '—'}`)
      .join('\n');
  }
  return String(value);
};

const enumText = (value: unknown) => (typeof value === 'string' && value ? formatEnumLabel(value) : asText(value));
const WORD_TYPE_LABELS: Record<string, string> = { core: 'Core', 'non-core': 'Non-Core' };
const CASE_LABELS: Record<string, string> = {
  accusative: 'Accusative',
  ablative: 'Ablative',
  both: 'Accusative + Ablative (Both)',
};
const labelFrom = (labels: Record<string, string>) => (value: unknown) =>
  typeof value === 'string' ? (labels[value] ?? value) : asText(value);

const valueAt = (value: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (current, key) => (current && typeof current === 'object' ? (current as Plain)[key] : undefined),
      value
    );

const humanize = (field: string) =>
  field === 'ai_review' ? 'AI review' : field.replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase());

const Empty = () => <span className="text-muted-foreground">—</span>;

const TONES = {
  removed: {
    symbol: '−',
    label: 'Before: ',
    sign: 'text-red-500',
    box: 'border-red-200 bg-red-50 text-red-900',
    mark: 'bg-red-200/80',
  },
  added: {
    symbol: '+',
    label: 'After: ',
    sign: 'text-green-600',
    box: 'border-green-300 bg-green-50 text-green-900',
    mark: 'bg-green-200/80',
  },
} as const;

/** A changed value as its old and new version; one that is only added or only removed shows just that side. */
function ChangedPair({ before, after, className }: { before: string; after: string; className: string }) {
  return (
    <div className="space-y-1">
      {(['removed', 'added'] as const).map(tone => {
        const [text, other] = tone === 'removed' ? [before, after] : [after, before];
        if (!text) return null;
        const { symbol, label, sign, box, mark } = TONES[tone];
        return (
          <div key={tone} className={cn(className, box)}>
            <span aria-hidden className={cn('mr-2 select-none font-semibold', sign)}>
              {symbol}
            </span>
            <span className="sr-only">{label}</span>
            {other ? <MarkedText text={text} other={other} markClass={mark} /> : text}
          </div>
        );
      })}
    </div>
  );
}

/** Looks like the editor's input; a changed value shows its old and new versions. */
function DiffValue({ before, after, multiline = false }: { before: string; after: string; multiline?: boolean }) {
  const box = 'w-full rounded-md border px-3 py-2 text-sm';
  if (before !== after) {
    return <ChangedPair before={before} after={after} className={cn(box, 'min-h-10 whitespace-pre-wrap')} />;
  }
  return (
    <div
      className={cn(
        box,
        'border-input bg-background',
        multiline ? 'min-h-[80px] whitespace-pre-wrap' : 'min-h-10 truncate'
      )}>
      {after || <Empty />}
    </div>
  );
}

function FieldLabel({ label, changed }: { label: string; changed: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Label>{label}</Label>
      {changed && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium leading-none text-amber-800">
          Changed
        </span>
      )}
    </div>
  );
}

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const LIST_FIELDS = new Set(['definitions', 'principal_parts']);
/** Fields whose value, or each list item, is a full and a shortened form. */
const FORM_FIELDS = new Set(['nominative_singular', 'genitive_singular', 'principal_parts']);
const FORM_PARTS = [
  ['full_form', 'Full Form'],
  ['shortened_form', 'Shortened Form'],
] as const;

/** One field of the word: a single value, a full and shortened form, or a list of either. */
function DiffField({
  field,
  label,
  format = asText,
  multiline,
}: {
  field: string;
  label: string;
  format?: (value: unknown) => string;
  multiline?: boolean;
}) {
  const word = useContext(DiffContext);
  const before = word.before[field];
  const after = word.after[field];
  const isList = LIST_FIELDS.has(field);
  const rows = isList ? Math.max(listOf(before).length, listOf(after).length) : 1;
  return (
    <div className="space-y-2">
      <FieldLabel label={label} changed={!sameWordValue(before, after)} />
      {Array.from({ length: rows }, (_, row) => {
        const [old, next] = [before, after].map(value => (isList ? listOf(value)[row] : value));
        if (!FORM_FIELDS.has(field)) {
          return <DiffValue key={row} before={format(old)} after={format(next)} multiline={multiline} />;
        }
        return (
          <div key={row} className="grid grid-cols-2 gap-2">
            {FORM_PARTS.map(([part, partLabel]) => (
              <div key={part} className="space-y-2">
                <Label className="text-xs">{partLabel}</Label>
                <DiffValue before={asText(valueAt(old, part))} after={asText(valueAt(next, part))} />
              </div>
            ))}
          </div>
        );
      })}
      {rows === 0 && <p className="text-sm text-gray-500">No {label.toLowerCase()}.</p>}
    </div>
  );
}

const FIELD_FORMATS: Partial<Record<WordFieldName, (value: unknown) => string>> = {
  type: labelFrom(WORD_TYPE_LABELS),
  case: labelFrom(CASE_LABELS),
  gender: enumText,
  declension: enumText,
  pronoun_type: enumText,
  person: enumText,
};

function ReviewFields({ section }: { section: string }) {
  const { before, after, changesOnly } = useContext(DiffContext);
  return (
    <WordFieldLayout
      section={section}
      visible={field => !changesOnly || !sameWordValue(before[field], after[field])}
      renderField={field => <DiffField field={field} format={FIELD_FORMATS[field]} {...WORD_FIELDS[field]} />}
    />
  );
}

/** One table cell: the form as it is, or its old and new forms when they differ. */
function DiffCell({ before, after, changed }: { before: unknown; after: unknown; changed: boolean }) {
  if (changed) return <ChangedPair before={asText(before)} after={asText(after)} className="rounded px-1.5 py-0.5" />;
  return Array.isArray(after) || after == null ? <ArrayCellContent value={after} /> : <span>{asText(after)}</span>;
}

function TableDiff() {
  const { before, after, changesOnly } = useContext(DiffContext);
  const [expanded, setExpanded] = useState(true);
  const table = getEditableTable(after as { part_of_speech: string });
  const beforeTable = table ? before[table.field] : undefined;
  const afterTable = table ? after[table.field] : undefined;
  const changedCells = useMemo(() => new Set(changedTableCells(beforeTable, afterTable)), [beforeTable, afterTable]);

  const isPronoun = after.part_of_speech === 'pronoun';
  const pronounType = (after.pronoun_type ?? null) as PronounType | null;
  const person = (after.person ?? null) as PronounPerson | null;
  const schema = table && (isPronoun ? getPronounTableSchema(pronounType, person) : table.schema);
  // Changed cells the table has no slot for, such as a form stored under a key the schema lacks.
  const unshown = useMemo(() => {
    if (!schema) return [];
    const shape = buildEmptyFromSchema(schema);
    return [...changedCells].filter(path => valueAt(shape, path) === undefined);
  }, [schema, changedCells]);

  if (!table || !schema || (changesOnly && changedCells.size === 0)) return null;

  return (
    <>
      <SchemaTable
        schema={schema}
        data={afterTable ?? {}}
        tableType={table.tableType}
        title={isPronoun ? getPronounTableTitle(pronounType, person) : table.title}
        color={table.color}
        isExpanded={expanded}
        onToggle={() => setExpanded(value => !value)}
        renderCell={cell => (
          <DiffCell before={valueAt(beforeTable, cell.path)} after={cell.value} changed={changedCells.has(cell.path)} />
        )}
        cellFilter={changesOnly ? cell => changedCells.has(cell.path) : undefined}
      />
      {unshown.length > 0 && (
        <div className="space-y-2 rounded-md border border-dashed border-gray-300 p-3">
          <p className="text-sm font-medium text-gray-700">Forms the table has no place for</p>
          {unshown.map(path => (
            <div key={path} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3 text-sm">
              <span className="text-gray-600">{path.split('.').map(humanize).join(' › ')}</span>
              <DiffCell before={valueAt(beforeTable, path)} after={valueAt(afterTable, path)} changed />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Changed fields the editor does not show, so nothing changes unseen. */
function OtherChanges() {
  const { before, after } = useContext(DiffContext);
  const table = getEditableTable(after as { part_of_speech: string });
  const shown = new Set<string>([
    ...WORD_FIELD_ROWS.base.flat(),
    ...(WORD_FIELD_ROWS[String(after.part_of_speech)] ?? []).flat(),
    ...(table ? [table.field] : []),
    'part_of_speech',
  ]);
  const others = changedWordFields(before, after).filter(field => !shown.has(field));
  if (others.length === 0) return null;
  return (
    <div className="space-y-4 border-t pt-4">
      <h3 className="text-sm font-semibold text-gray-700">Other changes</h3>
      {others.map(field => (
        <DiffField key={field} field={field} label={humanize(field)} multiline />
      ))}
    </div>
  );
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * A word's changes laid out like the vocabulary editor: the same fields in the
 * same order, with each changed value shown as its old and new version and
 * each changed table cell marked in place.
 */
export function WordDiffPanel({
  before: original,
  after,
  beforeLabel = 'Current',
  afterLabel = 'Proposed',
  actions,
}: WordDiffPanelProps) {
  const before = original ?? after;
  const [changesOnly, setChangesOnly] = useState(false);
  const summary = useMemo(() => summarizeWordChanges(before, after), [before, after]);
  const parts = [
    summary.fields.length > 0 && plural(summary.fields.length, 'field'),
    summary.tableCells > 0 && plural(summary.tableCells, 'form'),
  ].filter(Boolean);

  return (
    <DiffContext.Provider value={{ before, after, changesOnly: !!original && changesOnly }}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden border-l border-gray-200 bg-white">
        <div className="sticky top-0 z-10 flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-serif text-xl font-semibold text-roman-red">{asText(after.word)}</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {asText(after.part_of_speech)} ·{' '}
                {!original ? 'Read-only draft' : parts.length ? `${parts.join(' and ')} changed` : 'No changes'}
                {original && (
                  <span className="ml-3 whitespace-nowrap text-xs">
                    <span className="mr-1 font-semibold text-red-500">−</span>
                    {beforeLabel}
                    <span className="ml-3 mr-1 font-semibold text-green-600">+</span>
                    {afterLabel}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {original && (
                <div className="flex items-center gap-2">
                  <Switch id="word-diff-changes-only" checked={changesOnly} onCheckedChange={setChangesOnly} />
                  <Label htmlFor="word-diff-changes-only">Changes only</Label>
                </div>
              )}
              {actions}
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          <div className="space-y-6">
            <ReviewFields section="base" />
            <ReviewFields section={String(after.part_of_speech)} />
            <OtherChanges />
            <TableDiff />
            {original && changesOnly && parts.length === 0 && <p className="text-sm text-gray-500">Nothing changes.</p>}
          </div>
        </div>
      </div>
    </DiffContext.Provider>
  );
}
