import React, { createContext, useContext, useMemo, useState } from 'react';
import { Label } from '@/src/components/ui/label';
import { Switch } from '@/src/components/ui/switch';
import { cn } from '@/src/lib/utils';
import type { PronounPerson, PronounType } from '@/shared/types/vocabulary/schemas/enums';
import { differingSpan } from '@/src/lib/vocabulary-autocomplete-evaluations/comparison';
import { formatEnumLabel } from '@/src/utils/schema-helpers';
import {
  changedTableCells,
  changedWordFields,
  sameWordValue,
  summarizeWordChanges,
} from '@/src/utils/vocabulary/word-diff';
import { ArrayCellContent } from './tables/ArrayCellContent';
import { SchemaTable } from './tables/SchemaTable';
import { getEditableTable, getPronounTableSchema, getPronounTableTitle } from './wordTables';
import { buildEmptyFromSchema } from '@/src/utils/schema-defaults';

type Plain = Record<string, unknown>;

interface WordDiffPanelProps {
  /** The word before the change. */
  before: Plain;
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

const humanize = (field: string) => field.replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase());

const Empty = () => <span className="text-muted-foreground">—</span>;

/** A value with the letters that differ from `other` marked, so a changed macron stands out. */
function Marked({ text, other, markClass }: { text: string; other: string; markClass: string }) {
  if (!text) return <Empty />;
  if (!other) return <>{text}</>;
  const [start, changed, end] = differingSpan(text, other);
  return (
    <>
      {start}
      {changed && <mark className={cn('rounded-sm px-px text-inherit', markClass)}>{changed}</mark>}
      {end}
    </>
  );
}

const SIGN = {
  removed: { symbol: '−', label: 'Before: ', className: 'text-red-500' },
  added: { symbol: '+', label: 'After: ', className: 'text-green-600' },
} as const;

function Sign({ tone }: { tone: keyof typeof SIGN }) {
  return (
    <>
      <span aria-hidden className={cn('mr-2 select-none font-semibold', SIGN[tone].className)}>
        {SIGN[tone].symbol}
      </span>
      <span className="sr-only">{SIGN[tone].label}</span>
    </>
  );
}

/** Looks like the editor's input; a changed value shows its old and new versions. */
function DiffValue({ before, after, multiline = false }: { before: string; after: string; multiline?: boolean }) {
  const box = 'w-full rounded-md border px-3 py-2 text-sm';
  if (before === after) {
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
  // A value that is only added or only removed shows just that side.
  return (
    <div className="space-y-1">
      {before && (
        <div className={cn(box, 'min-h-10 whitespace-pre-wrap border-red-200 bg-red-50 text-red-900')}>
          <Sign tone="removed" />
          <Marked text={before} other={after} markClass="bg-red-200/80" />
        </div>
      )}
      {after && (
        <div className={cn(box, 'min-h-10 whitespace-pre-wrap border-green-300 bg-green-50 text-green-900')}>
          <Sign tone="added" />
          <Marked text={after} other={before} markClass="bg-green-200/80" />
        </div>
      )}
    </div>
  );
}

function FieldLabel({ label, changed, small = false }: { label: string; changed: boolean; small?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Label className={small ? 'text-xs' : undefined}>{label}</Label>
      {changed && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium leading-none text-amber-800">
          Changed
        </span>
      )}
    </div>
  );
}

const useFieldChange = (field: string) => {
  const { before, after, changesOnly } = useContext(DiffContext);
  const changed = !sameWordValue(before[field], after[field]);
  return { before: before[field], after: after[field], changed, hidden: changesOnly && !changed };
};

function ScalarField({
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
  const { before, after, changed, hidden } = useFieldChange(field);
  if (hidden) return null;
  return (
    <div className="space-y-2">
      <FieldLabel label={label} changed={changed} />
      <DiffValue before={format(before)} after={format(after)} multiline={multiline} />
    </div>
  );
}

/** Two fields side by side, as in the editor; hidden when "changes only" leaves both out. */
function Pair({ fields, children }: { fields: string[]; children: React.ReactNode }) {
  const { before, after, changesOnly } = useContext(DiffContext);
  if (changesOnly && fields.every(field => sameWordValue(before[field], after[field]))) return null;
  return <div className="grid grid-cols-2 gap-4">{children}</div>;
}

/** A noun's nominative or genitive: full and shortened form side by side. */
function WordFormField({ field, label }: { field: string; label: string }) {
  const { before, after, changed, hidden } = useFieldChange(field);
  if (hidden) return null;
  return (
    <div className="space-y-2">
      <FieldLabel label={label} changed={changed} />
      <div className="grid grid-cols-2 gap-2">
        {(['full_form', 'shortened_form'] as const).map(part => (
          <div key={part} className="space-y-2">
            <Label className="text-xs">{part === 'full_form' ? 'Full Form' : 'Shortened Form'}</Label>
            <DiffValue before={asText(valueAt(before, part))} after={asText(valueAt(after, part))} />
          </div>
        ))}
      </div>
    </div>
  );
}

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function DefinitionsField() {
  const { before, after, changed, hidden } = useFieldChange('definitions');
  if (hidden) return null;
  const length = Math.max(listOf(before).length, listOf(after).length);
  return (
    <div className="space-y-2">
      <FieldLabel label="Definitions" changed={changed} />
      <div className="space-y-2">
        {Array.from({ length }, (_, index) => (
          <DiffValue key={index} before={asText(listOf(before)[index])} after={asText(listOf(after)[index])} />
        ))}
        {length === 0 && <p className="text-sm text-gray-500">No definitions.</p>}
      </div>
    </div>
  );
}

function PrincipalPartsField() {
  const { before, after, changed, hidden } = useFieldChange('principal_parts');
  if (hidden) return null;
  const length = Math.max(listOf(before).length, listOf(after).length);
  return (
    <div className="space-y-2">
      <FieldLabel label="Principal Parts" changed={changed} />
      <div className="space-y-3">
        {Array.from({ length }, (_, index) => (
          <div key={index} className="grid grid-cols-2 gap-2">
            {(['full_form', 'shortened_form'] as const).map(part => (
              <div key={part} className="space-y-2">
                <Label className="text-xs">{part === 'full_form' ? 'Full Form' : 'Shortened Form'}</Label>
                <DiffValue
                  before={asText(valueAt(listOf(before)[index], part))}
                  after={asText(valueAt(listOf(after)[index], part))}
                />
              </div>
            ))}
          </div>
        ))}
        {length === 0 && <div className="text-sm text-gray-500">No principal parts added.</div>}
      </div>
    </div>
  );
}

/** The editor's fields for each part of speech, in its order. */
const PART_OF_SPEECH_FIELDS: Record<string, string[]> = {
  noun: ['gender', 'declension', 'nominative_singular', 'genitive_singular', 'declension_table'],
  pronoun: ['pronoun_type', 'person', 'declension_table'],
  adjective: ['declension', 'degrees_table'],
  verb: ['conjugation', 'is_deponent', 'principal_parts', 'conjugation_table'],
  preposition: ['case'],
};
const BASE_FIELDS = [
  'word',
  'type',
  'translation',
  'definitions',
  'etymology',
  'pronunciation',
  'alternate_form',
  'dictionary_entry',
  'part_of_speech',
];

function PartOfSpeechFields({ partOfSpeech }: { partOfSpeech: string }) {
  switch (partOfSpeech) {
    case 'noun':
      return (
        <>
          <Pair fields={['gender', 'declension']}>
            <ScalarField field="gender" label="Gender (optional)" format={enumText} />
            <ScalarField field="declension" label="Declension" format={enumText} />
          </Pair>
          <Pair fields={['nominative_singular', 'genitive_singular']}>
            <WordFormField field="nominative_singular" label="Nominative Singular" />
            <WordFormField field="genitive_singular" label="Genitive Singular" />
          </Pair>
        </>
      );
    case 'pronoun':
      return (
        <>
          <ScalarField field="pronoun_type" label="Pronoun Type" format={enumText} />
          <ScalarField field="person" label="Person" format={enumText} />
        </>
      );
    case 'adjective':
      return <ScalarField field="declension" label="Declension" format={enumText} />;
    case 'verb':
      return (
        <>
          <Pair fields={['conjugation', 'is_deponent']}>
            <ScalarField field="conjugation" label="Conjugation" />
            <ScalarField field="is_deponent" label="Deponent" format={value => (value ? 'Yes' : 'No')} />
          </Pair>
          <PrincipalPartsField />
        </>
      );
    case 'preposition':
      return <ScalarField field="case" label="Case" format={labelFrom(CASE_LABELS)} />;
    default:
      return null;
  }
}

/** One table cell: the form as it is, or its old and new forms when they differ. */
function DiffCell({ before, after, changed }: { before: unknown; after: unknown; changed: boolean }) {
  if (!changed) {
    return Array.isArray(after) || after == null ? <ArrayCellContent value={after} /> : <span>{asText(after)}</span>;
  }
  const beforeText = asText(before);
  const afterText = asText(after);
  return (
    <div className="space-y-1">
      {beforeText && (
        <div className="rounded bg-red-50 px-1.5 py-0.5 text-red-900">
          <Sign tone="removed" />
          <Marked text={beforeText} other={afterText} markClass="bg-red-200/80" />
        </div>
      )}
      {afterText && (
        <div className="rounded bg-green-50 px-1.5 py-0.5 text-green-900">
          <Sign tone="added" />
          <Marked text={afterText} other={beforeText} markClass="bg-green-200/80" />
        </div>
      )}
    </div>
  );
}

const hasPath = (value: unknown, path: string) => {
  let current = value;
  for (const key of path.split('.')) {
    if (!current || typeof current !== 'object' || !(key in current)) return false;
    current = (current as Plain)[key];
  }
  return true;
};

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
    return [...changedCells].filter(path => !hasPath(shape, path));
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
  const shown = new Set([...BASE_FIELDS, ...(PART_OF_SPEECH_FIELDS[String(after.part_of_speech)] ?? [])]);
  const others = changedWordFields(before, after).filter(field => !shown.has(field));
  if (others.length === 0) return null;
  return (
    <div className="space-y-4 border-t pt-4">
      <h3 className="text-sm font-semibold text-gray-700">Other changes</h3>
      {others.map(field => (
        <ScalarField key={field} field={field} label={humanize(field)} multiline />
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
  before,
  after,
  beforeLabel = 'Current',
  afterLabel = 'Proposed',
  actions,
}: WordDiffPanelProps) {
  const [changesOnly, setChangesOnly] = useState(false);
  const summary = useMemo(() => summarizeWordChanges(before, after), [before, after]);
  const parts = [
    summary.fields.length > 0 && plural(summary.fields.length, 'field'),
    summary.tableCells > 0 && plural(summary.tableCells, 'form'),
  ].filter(Boolean);

  return (
    <DiffContext.Provider value={{ before, after, changesOnly }}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden border-l border-gray-200 bg-white">
        <div className="sticky top-0 z-10 flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-serif text-xl font-semibold text-roman-red">{asText(after.word)}</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {asText(after.part_of_speech)} · {parts.length ? `${parts.join(' and ')} changed` : 'No changes'}
                <span className="ml-3 whitespace-nowrap text-xs">
                  <span className="mr-1 font-semibold text-red-500">−</span>
                  {beforeLabel}
                  <span className="ml-3 mr-1 font-semibold text-green-600">+</span>
                  {afterLabel}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch id="word-diff-changes-only" checked={changesOnly} onCheckedChange={setChangesOnly} />
                <Label htmlFor="word-diff-changes-only">Changes only</Label>
              </div>
              {actions}
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          <div className="space-y-6">
            <Pair fields={['word', 'type']}>
              <ScalarField field="word" label="Word" />
              <ScalarField field="type" label="Word Type" format={labelFrom(WORD_TYPE_LABELS)} />
            </Pair>
            <ScalarField field="translation" label="Translation" multiline />
            <DefinitionsField />
            <ScalarField field="etymology" label="Etymology" multiline />
            <ScalarField field="pronunciation" label="Pronunciation" />
            <ScalarField field="alternate_form" label="Alternate Form" />
            <ScalarField field="dictionary_entry" label="Dictionary Entry" />
            <PartOfSpeechFields partOfSpeech={String(after.part_of_speech)} />
            <OtherChanges />
            <TableDiff />
            {changesOnly && parts.length === 0 && <p className="text-sm text-gray-500">Nothing changes.</p>}
          </div>
        </div>
      </div>
    </DiffContext.Provider>
  );
}
