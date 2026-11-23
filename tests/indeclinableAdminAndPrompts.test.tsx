import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { WordEditPanel } from '@/src/components/ui/admin/vocabulary/WordEditPanel';
import { WordFiltersPanel } from '@/src/components/ui/admin/vocabulary/WordFiltersPanel';
import { MultiParadigmConfigSection } from '@/src/components/ui/admin/content-editor/MultiParadigmConfigSection';
import { GeneratedExercisePreviewRequestSchema } from '@/src/lib/tests/generated-preview-schema';
import {
  AdjectiveDeclensionSchema,
  NounDeclensionSchema,
  NounSchema,
  AdjectiveSchema,
} from '@/shared/types/vocabulary/schemas';
import { NounStructuredOutputSchema, AdjectiveStructuredOutputSchema } from '@/shared/types/vocabulary/ai';
import { getPromptForPartOfSpeech } from '@/shared/openai/prompts';
import { STARTER_VOCABULARY_EVALUATION_CASES } from '@/src/lib/vocabulary-autocomplete-evaluations/starter-cases';
import { adjectiveDeclensionOptions, nounDeclensionOptions } from '@/src/utils/vocabulary/formOptions';

jest.mock('@/src/components/ui/admin/vocabulary/AIAutocompleteButton', () => ({
  AIAutocompleteButton: () => null,
}));

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

// Radix Select relies on pointer-capture and scrolling APIs that jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

const emptyRow = () => ({ singular: null, plural: null });
const emptyAdjRow = () => ({
  masculine: emptyRow(),
  feminine: emptyRow(),
  neuter: emptyRow(),
});
const emptyAdjDegree = () => ({
  nominative: emptyAdjRow(),
  genitive: emptyAdjRow(),
  dative: emptyAdjRow(),
  accusative: emptyAdjRow(),
  ablative: emptyAdjRow(),
  vocative: emptyAdjRow(),
  locative: emptyAdjRow(),
});

const baseNoun = (overrides: Record<string, unknown> = {}) => ({
  id: 'noun-1',
  word: 'fās',
  part_of_speech: 'noun',
  translation: 'divine law',
  definitions: ['divine law'],
  etymology: null,
  pronunciation: null,
  type: 'core',
  alternate_form: null,
  dictionary_entry: 'fās',
  sort_key: 'fas',
  random_index: 0.5,
  createdAt: 'x',
  updatedAt: 'x',
  gender: 'neuter',
  declension: '3',
  nominative_singular: { full_form: 'fās', shortened_form: 'fās' },
  genitive_singular: null,
  declension_table: {
    nominative: { singular: ['fās'], plural: null },
    genitive: emptyRow(),
    dative: emptyRow(),
    accusative: { singular: ['fās'], plural: null },
    ablative: emptyRow(),
    vocative: emptyRow(),
    locative: emptyRow(),
  },
  ...overrides,
});

const baseAdjective = (overrides: Record<string, unknown> = {}) => ({
  id: 'adj-1',
  word: 'quattuor',
  part_of_speech: 'adjective',
  translation: 'four',
  definitions: ['four'],
  etymology: null,
  pronunciation: null,
  type: 'core',
  alternate_form: null,
  dictionary_entry: 'quattuor',
  sort_key: 'quattuor',
  random_index: 0.5,
  createdAt: 'x',
  updatedAt: 'x',
  declension: '3',
  degrees_table: {
    positive: {
      ...emptyAdjDegree(),
      nominative: {
        masculine: { singular: null, plural: ['quattuor'] },
        feminine: { singular: null, plural: ['quattuor'] },
        neuter: { singular: null, plural: ['quattuor'] },
      },
      accusative: {
        masculine: { singular: null, plural: ['quattuor'] },
        feminine: { singular: null, plural: ['quattuor'] },
        neuter: { singular: null, plural: ['quattuor'] },
      },
    },
    comparative: emptyAdjDegree(),
    superlative: emptyAdjDegree(),
  },
  ...overrides,
});

describe('indeclinable admin menus, editor warnings, schemas, and AI prompts', () => {
  it('exposes Indeclinable in formOptions and accepts it in schemas alongside legacy values', () => {
    expect(nounDeclensionOptions).toContainEqual({ value: 'indeclinable', label: 'Indeclinable' });
    expect(adjectiveDeclensionOptions).toContainEqual({ value: 'indeclinable', label: 'Indeclinable' });

    expect(NounDeclensionSchema.safeParse('indeclinable').success).toBe(true);
    expect(NounDeclensionSchema.safeParse('3-istem').success).toBe(true);
    expect(AdjectiveDeclensionSchema.safeParse('indeclinable').success).toBe(true);
    expect(AdjectiveDeclensionSchema.safeParse('1-2').success).toBe(true);

    expect(NounSchema.shape.declension.safeParse('indeclinable').success).toBe(true);
    expect(NounSchema.shape.declension.safeParse('1').success).toBe(true);
    expect(AdjectiveSchema.shape.declension.safeParse('indeclinable').success).toBe(true);
    expect(AdjectiveSchema.shape.declension.safeParse('1-2').success).toBe(true);

    expect(NounStructuredOutputSchema.shape.declension.safeParse('indeclinable').success).toBe(true);
    expect(AdjectiveStructuredOutputSchema.shape.declension.safeParse('indeclinable').success).toBe(true);

    const previewResult = GeneratedExercisePreviewRequestSchema.safeParse({
      type: 'generated-form-identification',
      data: {
        mode: 'step-by-step',
        generatorConfig: { collection: 'vocabulary_words_v5', wordSource: 'filters', count: 5 },
        paradigmConfigs: {
          'noun-declension': { enabled: true, steps: ['declension'], filters: { nounDeclension: 'indeclinable' } },
          'adjective-declension': {
            enabled: true,
            steps: ['declension'],
            filters: { adjectiveDeclension: 'indeclinable' },
          },
        },
      },
    });
    expect(previewResult.success).toBe(true);
  });

  it('shows Indeclinable in WordFiltersPanel for both nouns and adjectives', () => {
    const onFiltersChange = jest.fn();
    const { rerender } = render(
      <WordFiltersPanel
        filters={{
          partOfSpeech: 'noun',
          search: '',
          verbConjugation: 'all',
          isDeponent: 'both',
          nounDeclension: 'all',
          adjectiveDeclension: 'all',
          pronounType: 'all',
          pronounPerson: 'all',
          limit: 20,
        }}
        onFiltersChange={onFiltersChange}
        onReset={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Indeclinable')).toBeInTheDocument();
    expect(screen.queryByText('Declension indeclinable')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    rerender(
      <WordFiltersPanel
        filters={{
          partOfSpeech: 'adjective',
          search: '',
          verbConjugation: 'all',
          isDeponent: 'both',
          nounDeclension: 'all',
          adjectiveDeclension: 'all',
          pronounType: 'all',
          pronounPerson: 'all',
          limit: 20,
        }}
        onFiltersChange={onFiltersChange}
        onReset={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Indeclinable')).toBeInTheDocument();
    expect(screen.queryByText('Declension indeclinable')).not.toBeInTheDocument();
  });

  it('shows Indeclinable in MultiParadigmConfigSection for noun and adjective paradigms', () => {
    const onUpdate = jest.fn();
    render(
      <MultiParadigmConfigSection
        availableParadigms={['noun-declension', 'adjective-declension']}
        paradigmConfigs={{
          'noun-declension': { enabled: true, filters: {}, steps: ['declension'] },
          'adjective-declension': { enabled: true, filters: {}, steps: ['declension'] },
        }}
        onUpdateParadigmConfig={onUpdate}
        onToggleParadigm={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Indeclinable')).toBeInTheDocument();
    // Uncheck the "All" option inside the popover, then pick Indeclinable alone.
    fireEvent.click(screen.getAllByText('All')[1]);
    fireEvent.click(screen.getByText('Indeclinable'));
    expect(onUpdate).toHaveBeenLastCalledWith('noun-declension', {
      filters: { nounDeclension: 'indeclinable' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    fireEvent.click(screen.getByRole('button', { name: /Adjective Declension/ }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Indeclinable')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('All')[1]);
    fireEvent.click(screen.getByText('Indeclinable'));
    expect(onUpdate).toHaveBeenLastCalledWith('adjective-declension', {
      filters: { adjectiveDeclension: 'indeclinable' },
    });
  });

  it('warns in NounForm only when the declension table is uniform and declension is not indeclinable', () => {
    const { rerender } = render(<WordEditPanel word={baseNoun() as never} onSave={jest.fn()} updating={false} />);
    expect(screen.getByRole('status')).toHaveTextContent(/may be indeclinable/i);

    rerender(
      <WordEditPanel
        word={baseNoun({ id: 'noun-marked', declension: 'indeclinable' }) as never}
        onSave={jest.fn()}
        updating={false}
      />
    );
    expect(screen.queryByText(/may be indeclinable/i)).not.toBeInTheDocument();

    rerender(
      <WordEditPanel
        word={
          baseNoun({
            id: 'noun-mane',
            word: 'māne',
            declension_table: {
              nominative: { singular: ['māne'], plural: null },
              genitive: emptyRow(),
              dative: emptyRow(),
              accusative: emptyRow(),
              ablative: emptyRow(),
              vocative: emptyRow(),
              locative: emptyRow(),
            },
          }) as never
        }
        onSave={jest.fn()}
        updating={false}
      />
    );
    expect(screen.queryByText(/may be indeclinable/i)).not.toBeInTheDocument();

    // Older saved declined noun still loads cleanly without warning.
    rerender(
      <WordEditPanel
        word={
          baseNoun({
            id: 'noun-puella',
            word: 'puella',
            declension: '1',
            declension_table: {
              nominative: { singular: ['puella'], plural: ['puellae'] },
              genitive: { singular: ['puellae'], plural: ['puellārum'] },
              dative: emptyRow(),
              accusative: emptyRow(),
              ablative: emptyRow(),
              vocative: emptyRow(),
              locative: emptyRow(),
            },
          }) as never
        }
        onSave={jest.fn()}
        updating={false}
      />
    );
    expect(screen.getByRole('heading', { name: 'puella' })).toBeInTheDocument();
    expect(screen.queryByText(/may be indeclinable/i)).not.toBeInTheDocument();

    // Half filled in, with only the nominative and the vocative that repeats it, puella is not flagged.
    rerender(
      <WordEditPanel
        word={
          baseNoun({
            id: 'noun-puella-partial',
            word: 'puella',
            declension: '1',
            declension_table: {
              nominative: { singular: ['puella'], plural: null },
              genitive: emptyRow(),
              dative: emptyRow(),
              accusative: emptyRow(),
              ablative: emptyRow(),
              vocative: { singular: ['puella'], plural: null },
              locative: emptyRow(),
            },
          }) as never
        }
        onSave={jest.fn()}
        updating={false}
      />
    );
    expect(screen.getByRole('heading', { name: 'puella' })).toBeInTheDocument();
    expect(screen.queryByText(/may be indeclinable/i)).not.toBeInTheDocument();
  });

  it.each([
    ['noun', baseNoun, 'Third'],
    ['adjective', baseAdjective, 'Third'],
  ] as const)(
    'hides the %s warning as soon as Declension is set to Indeclinable in the editor',
    async (_partOfSpeech, buildWord, declinedLabel) => {
      const user = userEvent.setup();
      // AIEnumSelect's label is not tied to its trigger, so the select is found through its form item.
      const declensionSelect = () =>
        within(screen.getByText('Declension', { selector: 'label' }).parentElement!).getByRole('combobox');
      render(<WordEditPanel word={buildWord() as never} onSave={jest.fn()} updating={false} />);
      expect(screen.getByRole('status')).toHaveTextContent(/may be indeclinable/i);

      await user.click(declensionSelect());
      await user.click(await screen.findByRole('option', { name: 'Indeclinable' }));
      expect(screen.queryByText(/may be indeclinable/i)).not.toBeInTheDocument();

      await user.click(declensionSelect());
      await user.click(await screen.findByRole('option', { name: declinedLabel }));
      expect(screen.getByRole('status')).toHaveTextContent(/may be indeclinable/i);
    }
  );

  it('warns in AdjectiveForm for uniform positive tables (including nēquam) until marked indeclinable', () => {
    const { rerender } = render(<WordEditPanel word={baseAdjective() as never} onSave={jest.fn()} updating={false} />);
    expect(screen.getByRole('status')).toHaveTextContent(/may be indeclinable/i);

    const nequamUnmarked = baseAdjective({
      id: 'adj-nequam',
      word: 'nēquam',
      declension: '3',
      degrees_table: {
        positive: {
          ...emptyAdjDegree(),
          nominative: {
            masculine: { singular: ['nēquam'], plural: ['nēquam'] },
            feminine: emptyRow(),
            neuter: emptyRow(),
          },
          accusative: {
            masculine: { singular: ['nēquam'], plural: ['nēquam'] },
            feminine: emptyRow(),
            neuter: emptyRow(),
          },
        },
        comparative: {
          ...emptyAdjDegree(),
          nominative: {
            masculine: { singular: ['nēquior'], plural: ['nēquiōrēs'] },
            feminine: emptyRow(),
            neuter: emptyRow(),
          },
        },
        superlative: emptyAdjDegree(),
      },
    });
    rerender(<WordEditPanel word={nequamUnmarked as never} onSave={jest.fn()} updating={false} />);
    expect(screen.getByRole('status')).toHaveTextContent(/may be indeclinable/i);

    rerender(
      <WordEditPanel
        word={{ ...nequamUnmarked, id: 'adj-nequam-marked', declension: 'indeclinable' } as never}
        onSave={jest.fn()}
        updating={false}
      />
    );
    expect(screen.queryByText(/may be indeclinable/i)).not.toBeInTheDocument();
  });

  it('keeps indeclinable nouns and adjectives on their own prompts and includes starter eval coverage', () => {
    const nounPrompt = getPromptForPartOfSpeech('noun', 'fās');
    expect(nounPrompt).toContain('Analyze the Latin noun "fās"');
    expect(nounPrompt).toContain('declension="indeclinable"');
    expect(nounPrompt).toContain('fās');
    expect(nounPrompt).toContain('fill only the cells where the word is actually used');

    const adjPrompt = getPromptForPartOfSpeech('adjective', 'nēquam');
    expect(adjPrompt).toContain('Analyze the Latin adjective "nēquam"');
    expect(adjPrompt).toContain('declension="indeclinable"');
    expect(adjPrompt).toContain('nēquam');
    expect(adjPrompt).toContain('mīlle');
    expect(adjPrompt).toContain('4 to 100');
    expect(adjPrompt).toContain('fill only the cells where the word is actually used');

    const adverbPrompt = getPromptForPartOfSpeech('adverb', 'saepe');
    expect(adverbPrompt).toContain('Analyze the Latin adverb "saepe"');
    expect(adverbPrompt).not.toContain('declension="indeclinable"');

    const titles = STARTER_VOCABULARY_EVALUATION_CASES.map(entry => entry.title);
    expect(new Set(titles).size).toBe(titles.length);
    const indeclCase = STARTER_VOCABULARY_EVALUATION_CASES.find(
      entry => entry.title !== 'Indeclinables: saepe, ad, et' && entry.entries.some(word => word.word === 'fās')
    );
    expect(indeclCase).toBeDefined();
    expect(indeclCase!.entries).toEqual([
      { id: 'fas', word: 'fās', partOfSpeech: 'noun' },
      { id: 'quattuor', word: 'quattuor', partOfSpeech: 'adjective' },
      { id: 'frugi', word: 'frūgī', partOfSpeech: 'adjective' },
      { id: 'nequam', word: 'nēquam', partOfSpeech: 'adjective' },
    ]);
  });
});
