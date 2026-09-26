import type { Firestore, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { MAX_GENERATED_FILTER_OPERANDS, MAX_GENERATED_WORD_COUNT } from '@/src/config/generatedExerciseLimits';
import { getReadableVocabularyPool, loadVocabularyPoolWords } from '@/src/lib/vocabulary-pools/archive.server';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import type { FormSelection, GeneratorFilters } from '@/src/types/exercises/base';
import type { FormParadigm, ParadigmConfigs } from '@/src/types/exercises/paradigm';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import { parseFormPathFromString } from '@/src/utils/exerciseFormPaths';
import { TABLE_TYPE_CONFIG, type TableType } from '@/src/utils/schema-helpers';
import { categorizeMatchingPaths, scanTableForMatchingForms } from '@/src/utils/tableScanner';
import { stripMacrons } from '@/src/utils/exercises/helpers';
import { getApplicableStepsForFormPath } from '@/src/utils/exercises/formIdentificationCompatibility';
import { getExerciseDisplayForm } from '@/src/utils/exercises/formSelection';
import { prepareGeneratedFormIdentificationWord } from '@/src/utils/exercises/formIdentificationPreparation';
import { isRejectedBySpecAwarePronounOverlap } from '@/src/utils/generated/pronounParadigmFiltering';
import { isSelectableMorphologyForm } from '@/src/utils/morphologyForms';
import type { GeneratedExercisePreviewDiagnostics } from './generated-preview-schema';
import { isUsableGeneratedTranslationWord, type GeneratedExercise } from './generated-exercises';

export const PER_SPEC_SCAN_FLOOR = 400;
const BASE_GLOBAL_SCAN = 2000;
const SCAN_MULTIPLIER = 2;
const PER_SPEC_SCAN_MULTIPLIER = 40;
const MIN_ADAPTIVE_BATCH = 4;
const MAX_ADAPTIVE_BATCH = 100;
const POOL_STREAM_CHUNK = 50;

export interface WordQuerySpec {
  id: string;
  partOfSpeech?: string;
  filters: Omit<GeneratorFilters, 'partOfSpeech'>;
  formSelection?: FormSelection;
  tableType?: TableType;
  steps?: FormIdentificationStep[];
  paradigm?: FormParadigm;
}

export interface CollectGeneratedExerciseWordsResult {
  words: ExerciseWordResponse[];
  diagnostics: GeneratedExercisePreviewDiagnostics[];
  globalScanLimitReached: boolean;
  requestedCount: number | 'all';
  uniqueWords?: number;
}

export class GeneratedVocabularySourceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, status = 400, code = 'GENERATED_SOURCE_INVALID') {
    super(message);
    this.name = 'GeneratedVocabularySourceError';
    this.code = code;
    this.status = status;
  }
}

const parseFilterValues = (value?: unknown): string[] => {
  if (typeof value !== 'string' || !value || value === 'all' || value === 'both') return [];
  return value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .slice(0, MAX_GENERATED_FILTER_OPERANDS);
};

export const applyValueFilter = (query: Query, field: string, value?: unknown): Query => {
  const values = parseFilterValues(value);
  if (values.length === 0) return query;
  return values.length === 1 ? query.where(field, '==', values[0]) : query.where(field, 'in', values);
};

function matchesPoolFilters(data: Record<string, unknown>, spec: WordQuerySpec): boolean {
  if (spec.partOfSpeech && data.part_of_speech !== spec.partOfSpeech) return false;

  const matchesValue = (field: string, value?: unknown) => {
    const values = parseFilterValues(value);
    return values.length === 0 || (typeof data[field] === 'string' && values.includes(data[field]));
  };
  const filters = spec.filters;
  if (filters.search) {
    const search = stripMacrons(filters.search);
    if (typeof data.sort_key !== 'string' || !data.sort_key.startsWith(search)) return false;
  }

  if (spec.partOfSpeech === 'verb') {
    if (!matchesValue('conjugation', filters.verbConjugation)) return false;
    if (filters.isDeponent === 'true' && data.is_deponent !== true) return false;
    if (filters.isDeponent === 'false' && data.is_deponent !== false) return false;
  } else if (spec.partOfSpeech === 'noun') {
    if (!matchesValue('declension', filters.nounDeclension)) return false;
  } else if (spec.partOfSpeech === 'adjective') {
    if (!matchesValue('declension', filters.adjectiveDeclension)) return false;
  } else if (spec.partOfSpeech === 'pronoun') {
    if (!matchesValue('pronoun_type', filters.pronounType)) return false;
    if (!matchesValue('person', filters.pronounPerson)) return false;
  }

  return true;
}

function applyFilters(query: Query, spec: WordQuerySpec): Query {
  const filters = spec.filters;
  if (spec.partOfSpeech) query = query.where('part_of_speech', '==', spec.partOfSpeech);

  if (spec.partOfSpeech === 'verb') {
    query = applyValueFilter(query, 'conjugation', filters.verbConjugation);
    if (filters.isDeponent === 'true') query = query.where('is_deponent', '==', true);
    if (filters.isDeponent === 'false') query = query.where('is_deponent', '==', false);
  } else if (spec.partOfSpeech === 'noun') {
    query = applyValueFilter(query, 'declension', filters.nounDeclension);
  } else if (spec.partOfSpeech === 'adjective') {
    query = applyValueFilter(query, 'declension', filters.adjectiveDeclension);
  } else if (spec.partOfSpeech === 'pronoun') {
    query = applyValueFilter(query, 'pronoun_type', filters.pronounType);
    query = applyValueFilter(query, 'person', filters.pronounPerson);
  }

  return query;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGeneratedExerciseRng(seed: number): () => number {
  return mulberry32(seed >>> 0);
}

const deriveSubstream = (rng: () => number): (() => number) => mulberry32(Math.floor(rng() * 0xffffffff));

const shuffleWithRng = <T>(values: T[], rng: () => number): T[] => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
};

export function allocateFairShares(specCount: number, count: number, rng: () => number): number[] {
  if (specCount <= 0) return [];
  const order = shuffleWithRng(
    Array.from({ length: specCount }, (_, index) => index),
    rng
  );
  const base = Math.floor(count / specCount);
  const remainder = count % specCount;
  const shares = Array.from({ length: specCount }, () => base);
  for (let index = 0; index < remainder; index += 1) {
    shares[order[index]] += 1;
  }
  return shares;
}

export function perSpecScanCeiling(share: number): number {
  return Math.max(PER_SPEC_SCAN_FLOOR, PER_SPEC_SCAN_MULTIPLIER * Math.max(share, 1));
}

function globalScanBudget(count: number): number {
  return Math.max(BASE_GLOBAL_SCAN, SCAN_MULTIPLIER * count);
}

function adaptiveBatchSize(remainingShare: number, isFirstBatch: boolean, deficit: number): number {
  if (isFirstBatch) return Math.max(1, remainingShare);
  return Math.min(MAX_ADAPTIVE_BATCH, Math.max(MIN_ADAPTIVE_BATCH, 2 * deficit));
}

const getPathValues = (value: Record<string, unknown>, path: string): string[] => {
  let current: unknown = value;
  for (const key of path.split('.')) {
    if (!current || typeof current !== 'object' || !(key in current)) return [];
    current = (current as Record<string, unknown>)[key];
  }
  if (typeof current === 'string') return isSelectableMorphologyForm(current) ? [current] : [];
  return Array.isArray(current) ? current.filter(isSelectableMorphologyForm) : [];
};

type FormCandidate = { form: string; path: string };
type FormPicker = (candidates: FormCandidate[]) => FormCandidate | undefined;

const randomFormPicker =
  (formRng: () => number): FormPicker =>
  candidates =>
    candidates[Math.floor(formRng() * candidates.length)];

function getFormCandidates(word: Record<string, unknown>, spec: WordQuerySpec) {
  const tableType = spec.tableType;
  const selectedPaths = spec.formSelection?.selectedCellPaths || [];
  if (!tableType || !selectedPaths.length) return null;
  const tableField = TABLE_TYPE_CONFIG[tableType];
  const table = word[tableField];
  if (!table) return null;

  const steps = spec.steps;
  const compatiblePaths = steps
    ? selectedPaths.filter(
        path => (getApplicableStepsForFormPath(path, tableType, steps)?.applicableSteps.length ?? 0) > 0
      )
    : selectedPaths;
  const candidates: FormCandidate[] = compatiblePaths.flatMap(path =>
    getPathValues(word, `${tableField}.${path}`).map(form => ({ form, path }))
  );
  return { table, tableType, compatiblePaths, candidates };
}

function selectForm(word: Record<string, unknown>, spec: WordQuerySpec, pickForm: FormPicker) {
  const available = getFormCandidates(word, spec);
  if (!available?.candidates.length) return null;

  const selected = pickForm(available.candidates);
  if (!selected) return null;
  const matchingPaths = scanTableForMatchingForms(available.table, selected.form, available.tableType);
  const paths = categorizeMatchingPaths(matchingPaths, available.compatiblePaths);
  if (!paths.primaryPaths.includes(selected.path)) paths.primaryPaths.unshift(selected.path);
  return { selected, ...paths };
}

function mapWord(doc: QueryDocumentSnapshot, spec: WordQuerySpec, pickForm: FormPicker): ExerciseWordResponse | null {
  const data = doc.data() as Record<string, unknown>;
  const selectedPaths = spec.formSelection?.selectedCellPaths || [];
  const selection = spec.tableType && selectedPaths.length ? selectForm(data, spec, pickForm) : null;
  if (selectedPaths.length && !selection) return null;

  const parsedTableType = spec.tableType;
  const formPath =
    selection && parsedTableType ? parseFormPathFromString(selection.selected.path, parsedTableType) : null;
  const primary =
    selection && parsedTableType
      ? selection.primaryPaths.map(path => parseFormPathFromString(path, parsedTableType)).filter(Boolean)
      : undefined;
  const optional =
    selection && parsedTableType
      ? selection.optionalPaths.map(path => parseFormPathFromString(path, parsedTableType)).filter(Boolean)
      : undefined;

  return {
    id: doc.id,
    root_word: String(data.word || ''),
    dictionary_entry: typeof data.dictionary_entry === 'string' ? data.dictionary_entry : null,
    selected_form: selection?.selected.form || String(data.word || ''),
    part_of_speech: data.part_of_speech,
    form_path: formPath,
    primary_form_paths: primary?.length ? primary : undefined,
    optional_form_paths: optional?.length ? optional : undefined,
    ...(typeof data.conjugation === 'string' ? { conjugation: data.conjugation } : {}),
    ...(typeof data.declension === 'string' ? { declension: data.declension } : {}),
    ...(Array.isArray(data.definitions)
      ? { definitions: data.definitions.filter(value => typeof value === 'string') }
      : {}),
    ...(typeof data.is_deponent === 'boolean' ? { is_deponent: data.is_deponent } : {}),
    ...(typeof data.translation === 'string' ? { translation: data.translation } : {}),
    ...(typeof data.gender === 'string' ? { gender: data.gender } : {}),
    ...(typeof data.pronoun_type === 'string' ? { pronoun_type: data.pronoun_type } : {}),
    ...(typeof data.person === 'string' || data.person === null ? { person: data.person } : {}),
  } as ExerciseWordResponse;
}

function evaluateCandidate(
  doc: QueryDocumentSnapshot,
  spec: WordQuerySpec,
  exercise: GeneratedExercise,
  pickForm: FormPicker,
  paradigmConfigs: ParadigmConfigs
): ExerciseWordResponse | null {
  if (doc.data()._deletionPending) return null;
  const word = mapWord(doc, spec, pickForm);
  if (!word) return null;
  if (isRejectedBySpecAwarePronounOverlap(word, spec.paradigm, paradigmConfigs)) return null;
  if (exercise.type === 'generated-form-identification') {
    if (getExerciseDisplayForm(word).trim().length === 0) return null;
    if (!prepareGeneratedFormIdentificationWord(exercise, word)) return null;
    return word;
  }
  return isUsableGeneratedTranslationWord(exercise, word) ? word : null;
}

interface CandidateStream {
  readonly spec: WordQuerySpec;
  readonly scanCeiling: number;
  totalScanned: number;
  exhausted: boolean;
  scanLimitReached: boolean;
  unread: QueryDocumentSnapshot[];
  fetchedOnce: boolean;
  nextBatch(limit: number, scanAllowance: number): Promise<QueryDocumentSnapshot[]>;
}

const canStreamContinue = (stream: CandidateStream, globalBudgetRemaining: number) =>
  !stream.exhausted && !stream.scanLimitReached && globalBudgetRemaining > 0;

class QueryCandidateStream implements CandidateStream {
  totalScanned = 0;
  exhausted = false;
  scanLimitReached = false;
  unread: QueryDocumentSnapshot[] = [];
  fetchedOnce = false;
  private lastSnapshot: QueryDocumentSnapshot | null = null;
  private wrapPhase: 'high' | 'low' | 'done' | null = null;
  private threshold = 0;
  private readonly seenIds = new Set<string>();
  private initialized = false;

  constructor(
    readonly spec: WordQuerySpec,
    readonly scanCeiling: number,
    private readonly db: Firestore,
    private readonly collection: string,
    private readonly queryRng: () => number,
    private readonly unbounded: boolean
  ) {}

  async nextBatch(limit: number, scanAllowance: number): Promise<QueryDocumentSnapshot[]> {
    if (this.exhausted || this.scanLimitReached || limit <= 0 || scanAllowance <= 0) return [];
    const remainingCeiling = this.unbounded ? limit : Math.max(0, this.scanCeiling - this.totalScanned);
    if (!this.unbounded && remainingCeiling <= 0) {
      this.scanLimitReached = true;
      return [];
    }
    const fetchLimit = Math.min(limit, remainingCeiling, scanAllowance);
    this.ensureInitialized();
    if (this.spec.filters.search) return this.nextSearchBatch(fetchLimit);
    if (this.unbounded) return this.nextUnboundedRandomBatch(fetchLimit);
    return this.nextRandomBatch(fetchLimit);
  }

  private ensureInitialized() {
    if (this.initialized) return;
    this.initialized = true;
    if (!this.spec.filters.search && !this.unbounded) {
      this.threshold = this.queryRng();
      this.wrapPhase = 'high';
    }
  }

  private baseQuery(): Query {
    return applyFilters(this.db.collection(this.collection), this.spec);
  }

  private async nextSearchBatch(limit: number): Promise<QueryDocumentSnapshot[]> {
    const search = stripMacrons(this.spec.filters.search || '');
    let query: Query = this.baseQuery()
      .where('sort_key', '>=', search)
      .where('sort_key', '<=', `${search}\uf8ff`)
      .orderBy('sort_key');
    if (this.lastSnapshot) query = query.startAfter(this.lastSnapshot);
    query = query.limit(limit);
    const snapshot = await query.get();
    this.totalScanned += snapshot.docs.length;
    if (!this.unbounded && this.totalScanned >= this.scanCeiling) this.scanLimitReached = true;
    if (snapshot.docs.length > 0) this.lastSnapshot = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.docs.length < limit) this.exhausted = true;
    return this.dedupe(snapshot.docs);
  }

  private async nextUnboundedRandomBatch(limit: number): Promise<QueryDocumentSnapshot[]> {
    let query: Query = this.baseQuery().orderBy('random_index');
    if (this.lastSnapshot) query = query.startAfter(this.lastSnapshot);
    query = query.limit(limit);
    const snapshot = await query.get();
    this.totalScanned += snapshot.docs.length;
    if (snapshot.docs.length > 0) this.lastSnapshot = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.docs.length < limit) this.exhausted = true;
    return this.dedupe(snapshot.docs);
  }

  private async nextRandomBatch(limit: number): Promise<QueryDocumentSnapshot[]> {
    const docs: QueryDocumentSnapshot[] = [];
    let remaining = limit;
    while (remaining > 0 && !this.exhausted && this.wrapPhase !== 'done') {
      const phase = this.wrapPhase;
      if (phase !== 'high' && phase !== 'low') break;

      let query = this.baseQuery().orderBy('random_index');
      query =
        phase === 'high'
          ? query.where('random_index', '>=', this.threshold)
          : query.where('random_index', '<', this.threshold);
      if (this.lastSnapshot) query = query.startAfter(this.lastSnapshot);

      const snapshot = await query.limit(remaining).get();
      this.totalScanned += snapshot.docs.length;
      if (this.totalScanned >= this.scanCeiling) this.scanLimitReached = true;
      docs.push(...snapshot.docs);
      if (snapshot.docs.length > 0) this.lastSnapshot = snapshot.docs[snapshot.docs.length - 1];

      if (snapshot.docs.length < remaining) {
        this.advancePhase();
        remaining = limit - docs.length;
        if (this.scanLimitReached) break;
        continue;
      }
      remaining = 0;
    }
    return this.dedupe(docs);
  }

  private advancePhase() {
    if (this.wrapPhase === 'high') {
      this.wrapPhase = 'low';
      this.lastSnapshot = null;
      return;
    }
    this.wrapPhase = 'done';
    this.exhausted = true;
  }

  private dedupe(docs: QueryDocumentSnapshot[]): QueryDocumentSnapshot[] {
    return docs.filter(doc => {
      if (this.seenIds.has(doc.id)) return false;
      this.seenIds.add(doc.id);
      return true;
    });
  }
}

class PoolCandidateStream implements CandidateStream {
  // A pool is already a finite candidate set. Scan it to exhaustion if needed.
  readonly scanCeiling = Number.POSITIVE_INFINITY;
  totalScanned = 0;
  exhausted = false;
  scanLimitReached = false;
  unread: QueryDocumentSnapshot[] = [];
  fetchedOnce = false;
  private cursor = 0;
  private readonly seenIds = new Set<string>();

  constructor(
    readonly spec: WordQuerySpec,
    private readonly ids: string[],
    private readonly loadDocs: (ids: string[]) => Promise<QueryDocumentSnapshot[]>
  ) {}

  async nextBatch(limit: number): Promise<QueryDocumentSnapshot[]> {
    if (this.exhausted || limit <= 0) return [];
    const docs: QueryDocumentSnapshot[] = [];
    while (docs.length < limit && this.cursor < this.ids.length) {
      // Keep reads batched even for a small quota in a sparse pool. Any extra
      // matches stay in the stream's unread buffer for replenishment/borrowing.
      const slice = this.ids.slice(this.cursor, this.cursor + POOL_STREAM_CHUNK);
      this.cursor += slice.length;
      const loaded = await this.loadDocs(slice);
      this.totalScanned += loaded.length;

      for (const doc of loaded) {
        if (this.seenIds.has(doc.id)) continue;
        if (!matchesPoolFilters(doc.data(), this.spec)) continue;
        this.seenIds.add(doc.id);
        docs.push(doc);
      }
    }
    if (this.cursor >= this.ids.length) this.exhausted = true;
    return docs;
  }
}

function createSharedPoolLoader(pool: NonNullable<Awaited<ReturnType<typeof getReadableVocabularyPool>>>) {
  const cache = new Map<string, QueryDocumentSnapshot | null>();
  return async (ids: string[]): Promise<QueryDocumentSnapshot[]> => {
    const missing = ids.filter(id => !cache.has(id));
    if (missing.length > 0) {
      const loaded = await loadVocabularyPoolWords(pool, missing);
      const found = new Set(loaded.map(doc => doc.id));
      loaded.forEach(doc => cache.set(doc.id, doc));
      missing.filter(id => !found.has(id)).forEach(id => cache.set(id, null));
    }
    return ids.map(id => cache.get(id)).filter((doc): doc is QueryDocumentSnapshot => Boolean(doc));
  };
}

interface AcceptedWord {
  word: ExerciseWordResponse;
  doc: QueryDocumentSnapshot;
  spec: WordQuerySpec;
}

async function takeEligible(
  stream: CandidateStream,
  target: number,
  exercise: GeneratedExercise,
  formRng: () => number,
  paradigmConfigs: ParadigmConfigs,
  budget: { remaining: number },
  deficit: number,
  unbounded: boolean,
  acceptedIds?: Set<string>
): Promise<AcceptedWord[]> {
  const accepted: AcceptedWord[] = [];
  while (
    accepted.length < target &&
    (stream.unread.length > 0 || canStreamContinue(stream, unbounded ? 1 : budget.remaining))
  ) {
    if (stream.unread.length === 0) {
      const remaining = target - accepted.length;
      const batchSize = unbounded
        ? Math.min(MAX_ADAPTIVE_BATCH, Math.max(remaining, MIN_ADAPTIVE_BATCH))
        : Math.min(adaptiveBatchSize(remaining, !stream.fetchedOnce, deficit), budget.remaining);
      const scannedBefore = stream.totalScanned;
      const docs = await stream.nextBatch(batchSize, unbounded ? Number.POSITIVE_INFINITY : budget.remaining);
      if (!unbounded) {
        budget.remaining = Math.max(0, budget.remaining - (stream.totalScanned - scannedBefore));
      }
      stream.fetchedOnce = true;
      stream.unread.push(...docs);
      if (docs.length === 0) break;
    }
    const doc = stream.unread.shift();
    if (!doc) break;
    if (acceptedIds?.has(doc.id)) continue;
    const word = evaluateCandidate(doc, stream.spec, exercise, randomFormPicker(formRng), paradigmConfigs);
    if (!word) continue;
    acceptedIds?.add(doc.id);
    accepted.push({ word, doc, spec: stream.spec });
  }
  return accepted;
}

/** Yields validated questions for further distinct surface forms of an already accepted word. */
function createFormRotation(
  entry: AcceptedWord,
  exercise: GeneratedExercise,
  formRng: () => number,
  paradigmConfigs: ParadigmConfigs
) {
  const candidatesByForm = new Map<string, FormCandidate[]>();
  for (const candidate of getFormCandidates(entry.doc.data(), entry.spec)?.candidates ?? []) {
    if (candidate.form === entry.word.selected_form) continue;
    candidatesByForm.set(candidate.form, [...(candidatesByForm.get(candidate.form) ?? []), candidate]);
  }
  const remainingForms = shuffleWithRng([...candidatesByForm.keys()], formRng);

  return (): AcceptedWord | null => {
    while (remainingForms.length > 0) {
      const sameForm = candidatesByForm.get(remainingForms.shift()!)!;
      const pickForm = () => sameForm[Math.floor(formRng() * sameForm.length)];
      const word = evaluateCandidate(entry.doc, entry.spec, exercise, pickForm, paradigmConfigs);
      if (word) return { ...entry, word };
    }
    return null;
  };
}

/**
 * Cycles through the accepted words, giving each one a new surface form per pass, until
 * `count` questions exist or every word has run out of forms. The first pass is `firstPass`.
 */
function rotateWordForms(
  firstPass: AcceptedWord[],
  count: number,
  exercise: GeneratedExercise,
  formRng: () => number,
  shuffleRng: () => number,
  paradigmConfigs: ParadigmConfigs
): AcceptedWord[] {
  const questions = firstPass.slice(0, count);
  let rotations = firstPass.map(entry => createFormRotation(entry, exercise, formRng, paradigmConfigs));

  while (questions.length < count && rotations.length > 0) {
    const pass: AcceptedWord[] = [];
    rotations = rotations.filter(nextForm => {
      const question = nextForm();
      if (question) pass.push(question);
      return question !== null;
    });

    const ordered = shuffleWithRng(pass, shuffleRng);
    // Passes hold distinct words, so only the boundary with the previous pass can repeat a word.
    if (ordered.length > 1 && ordered[0].doc.id === questions[questions.length - 1]?.doc.id) {
      [ordered[0], ordered[1]] = [ordered[1], ordered[0]];
    }
    questions.push(...ordered.slice(0, count - questions.length));
  }
  return questions;
}

export async function collectGeneratedExerciseWords(options: {
  db: Firestore;
  collection: string;
  specs: WordQuerySpec[];
  count: number | 'all';
  exercise: GeneratedExercise;
  poolId?: string | null;
  /** Caps distinct words; each is repeated with different forms until `count` is filled. */
  uniqueWordCount?: number | null;
  rng?: () => number;
  paradigmConfigs?: ParadigmConfigs;
}): Promise<CollectGeneratedExerciseWordsResult> {
  const rng = options.rng ?? Math.random;
  const allocationRng = deriveSubstream(rng);
  const poolRng = deriveSubstream(rng);
  const queryRng = deriveSubstream(rng);
  const formRng = deriveSubstream(rng);
  const shuffleRng = deriveSubstream(rng);

  const paradigmConfigs =
    options.paradigmConfigs ??
    (options.exercise.type === 'generated-form-identification' ? options.exercise.data.paradigmConfigs || {} : {});

  let specs = options.specs;
  if (specs.length === 0 && options.poolId) {
    specs = [{ id: 'pool', filters: {} }];
  }

  let poolIds: string[] | null = null;
  let loadPoolDocs: ((ids: string[]) => Promise<QueryDocumentSnapshot[]>) | null = null;
  if (options.poolId) {
    const pool = await getReadableVocabularyPool(options.db, options.poolId);
    if (!pool) {
      throw new GeneratedVocabularySourceError(
        `Vocabulary pool ${options.poolId} was not found`,
        404,
        'POOL_NOT_FOUND'
      );
    }
    const wordIds = Array.isArray(pool.data.wordDocIds)
      ? pool.data.wordDocIds.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id))
      : [];
    poolIds = shuffleWithRng([...new Set(wordIds)], poolRng);
    loadPoolDocs = createSharedPoolLoader(pool);
  }

  let numericCount = 0;
  let requestedCount: number | 'all' = 'all';
  const unbounded = options.count === 'all';
  if (options.count !== 'all') {
    numericCount = Math.min(Math.max(1, options.count), MAX_GENERATED_WORD_COUNT);
    requestedCount = numericCount;
  }
  const uniqueWordTarget =
    !unbounded && options.uniqueWordCount && options.uniqueWordCount > 0
      ? Math.min(options.uniqueWordCount, numericCount)
      : null;
  // Number of distinct words to collect; unique-word mode fills the rest with further forms.
  const wordTarget = uniqueWordTarget ?? numericCount;
  const acceptedIds = uniqueWordTarget === null ? undefined : new Set<string>();
  const shares = unbounded
    ? specs.map(() => Number.POSITIVE_INFINITY)
    : allocateFairShares(specs.length, wordTarget, allocationRng);
  const budget = {
    // Pool reads are bounded by its unique IDs and shared across all paradigms.
    // Collection queries retain their scan budget.
    remaining: unbounded || poolIds !== null ? Number.POSITIVE_INFINITY : globalScanBudget(wordTarget),
  };
  const initialBudget = budget.remaining;

  const streams: CandidateStream[] = specs.map((spec, index) => {
    const share = unbounded ? 0 : shares[index];
    const ceiling = unbounded ? Number.POSITIVE_INFINITY : perSpecScanCeiling(share);
    if (poolIds && loadPoolDocs) {
      return new PoolCandidateStream(spec, poolIds, loadPoolDocs);
    }
    return new QueryCandidateStream(spec, ceiling, options.db, options.collection, queryRng, unbounded);
  });

  const collected: AcceptedWord[][] = streams.map(() => []);

  if (unbounded) {
    for (let index = 0; index < streams.length; index += 1) {
      collected[index] = await takeEligible(
        streams[index],
        Number.POSITIVE_INFINITY,
        options.exercise,
        formRng,
        paradigmConfigs,
        budget,
        1,
        true
      );
    }
  } else {
    for (let index = 0; index < streams.length; index += 1) {
      collected[index] = await takeEligible(
        streams[index],
        shares[index],
        options.exercise,
        formRng,
        paradigmConfigs,
        budget,
        shares[index],
        false,
        acceptedIds
      );
    }

    let total = collected.reduce((sum, words) => sum + words.length, 0);
    const hasCapacity = (stream: CandidateStream) =>
      stream.unread.length > 0 || canStreamContinue(stream, budget.remaining);
    while (total < wordTarget && streams.some(hasCapacity)) {
      const deficit = wordTarget - total;
      let progressed = false;
      for (let index = 0; index < streams.length && total < wordTarget; index += 1) {
        if (!hasCapacity(streams[index])) continue;
        const extra = await takeEligible(
          streams[index],
          1,
          options.exercise,
          formRng,
          paradigmConfigs,
          budget,
          deficit,
          false,
          acceptedIds
        );
        if (extra.length > 0) {
          collected[index].push(...extra);
          total += extra.length;
          progressed = true;
        }
      }
      if (!progressed) break;
    }
  }

  const acceptedCount = collected.reduce((sum, words) => sum + words.length, 0);
  const combined = shuffleWithRng(collected.flat(), shuffleRng);
  const questions =
    uniqueWordTarget !== null
      ? rotateWordForms(combined, numericCount, options.exercise, formRng, shuffleRng, paradigmConfigs)
      : unbounded
        ? combined
        : combined.slice(0, numericCount);

  const diagnostics: GeneratedExercisePreviewDiagnostics[] = streams.map(stream => ({
    specId: stream.spec.id,
    collected: questions.filter(question => question.spec === stream.spec).length,
    scanned: stream.totalScanned,
    exhausted: stream.exhausted,
    scanLimitReached: stream.scanLimitReached,
  }));
  const words = questions.map(question => question.word);

  return {
    words,
    diagnostics,
    globalScanLimitReached: !unbounded && budget.remaining <= 0 && initialBudget > 0 && acceptedCount < wordTarget,
    requestedCount,
    ...(uniqueWordTarget !== null ? { uniqueWords: new Set(questions.map(question => question.doc.id)).size } : {}),
  };
}
