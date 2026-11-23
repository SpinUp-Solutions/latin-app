import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MAX_GENERATED_WORD_COUNT } from '@/src/config/generatedExerciseLimits';
import { ensureGeneratorConfig } from '@/src/utils/exercises/generatorConfigDefaults';
import { GeneratedTranslationEditor } from '@/src/components/ui/admin/content-editor/GeneratedTranslationEditor';
import { GeneratedFormIdentificationEditor } from '@/src/components/ui/admin/content-editor/GeneratedFormIdentificationEditor';

const mockUpdateContent = jest.fn();
const mockTranslationUpdateConfig = jest.fn();
const mockFormUpdateConfig = jest.fn();
let mockCount: number | 'all' = 5;
let mockUniqueWordCount: number | null = null;
let mockEditingContent: Record<string, unknown>;

jest.mock('@/src/store/hooks', () => ({
  useAppSelector: () => mockEditingContent,
}));

jest.mock('@/src/hooks/useGeneratedExerciseEditor', () => ({
  useGeneratedExerciseEditor: () => ({
    config: {
      collection: 'vocabulary_words_v5',
      wordSource: 'pool',
      poolId: 'pool-1',
      poolWordLimit: null,
      count: mockCount,
    },
    activePOS: undefined,
    derivedFilters: { partOfSpeech: 'all' },
    derivedFormSelection: undefined,
    formSelectionControls: {},
    handleFiltersChange: jest.fn(),
    handleResetFilters: jest.fn(),
    handleTogglePOS: jest.fn(),
    handleUpdatePosConfig: jest.fn(),
    isPoolWordSource: true,
    isPreviewFetching: false,
    isPreviewOpen: false,
    posSummary: { availablePOS: [], summary: undefined },
    previewData: undefined,
    previewError: undefined,
    setIsPreviewOpen: jest.fn(),
    updateConfig: mockTranslationUpdateConfig,
    updateContent: mockUpdateContent,
  }),
}));

jest.mock('@/src/hooks/useFormIdentificationEditor', () => ({
  useFormIdentificationEditor: () => ({
    config: {
      collection: 'vocabulary_words_v5',
      wordSource: 'pool',
      poolId: 'pool-1',
      poolWordLimit: null,
      count: mockCount,
      uniqueWordCount: mockUniqueWordCount,
    },
    derivedFilters: { partOfSpeech: 'all' },
    derivedFormSelection: undefined,
    handleGlobalFiltersChange: jest.fn(),
    handleResetFilters: jest.fn(),
    handleToggleParadigm: jest.fn(),
    handleUpdateParadigmConfig: jest.fn(),
    isPreviewFetching: false,
    isPreviewOpen: false,
    paradigmConfigs: {},
    paradigmInfo: { availableParadigms: [], isLoading: false },
    previewData: undefined,
    previewError: undefined,
    setIsPreviewOpen: jest.fn(),
    updateConfig: mockFormUpdateConfig,
    updateContent: mockUpdateContent,
  }),
}));

jest.mock('@/src/components/ui/admin/content-editor/WordSourceSection', () => ({
  WordSourceSection: ({
    poolContent,
    onChange,
  }: {
    poolContent: React.ReactNode;
    onChange: (value: 'filters' | 'pool') => void;
  }) => (
    <div>
      <button type="button" onClick={() => onChange('filters')}>
        Custom Filters
      </button>
      <button type="button" onClick={() => onChange('pool')}>
        Vocabulary Pool
      </button>
      {poolContent}
    </div>
  ),
}));

jest.mock('@/src/components/ui/admin/vocabulary-pools/VocabularyPoolSelector', () => ({
  VocabularyPoolSelector: () => <div>Selected pool</div>,
}));

jest.mock('@/src/components/ui/form-components', () => ({
  SimpleInput: () => null,
  SimpleTextarea: () => null,
  SimpleSelect: () => null,
}));

jest.mock('@/src/components/ui/admin/content-editor/AudioUploadSection', () => ({
  AudioUploadSection: () => null,
}));

jest.mock('@/src/components/ui/admin/content-editor/ExerciseFeedbackSection', () => ({
  ExerciseFeedbackSection: () => null,
}));

jest.mock('@/src/components/ui/admin/content-editor/MultiPosConfigSection', () => ({
  MultiPosConfigSection: () => null,
}));

jest.mock('@/src/components/ui/admin/content-editor/MultiParadigmConfigSection', () => ({
  MultiParadigmConfigSection: () => null,
}));

jest.mock('@/src/components/ui/admin/vocabulary/WordFiltersPanel', () => ({
  WordFiltersPanel: () => null,
}));

jest.mock('@/src/utils/exercises/formIdentificationConfiguration', () => ({
  getGeneratedFormIdentificationConfigurationMessages: () => [],
}));

const translationExercise = {
  id: 'translation-1',
  type: 'generated-translation',
  title: 'Definitions',
  instructions: '',
  translationDirection: 'latin-to-english',
  feedbackConfig: { escalationLevels: [] },
  data: { generatorConfig: {}, posConfigs: {} },
};

const formExercise = {
  id: 'form-1',
  type: 'generated-form-identification',
  title: 'Morphology',
  instructions: '',
  feedbackConfig: { escalationLevels: [] },
  data: { mode: 'step-by-step', generatorConfig: {}, paradigmConfigs: {} },
};

describe.each([
  ['generated translation', GeneratedTranslationEditor, translationExercise, mockTranslationUpdateConfig, 1],
  ['generated morphology', GeneratedFormIdentificationEditor, formExercise, mockFormUpdateConfig, 2],
] as const)('%s pool question count', (_label, Editor, exercise, updateConfig, numberFieldCount) => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditingContent = exercise;
    mockCount = 5;
    mockUniqueWordCount = null;
  });

  it('defaults retries on for legacy exercises and saves an explicit admin opt-out', () => {
    const view = render(<Editor />);
    const toggle = screen.getByRole('checkbox', { name: 'Repeat incorrect words until correct' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(mockUpdateContent).toHaveBeenCalledWith({ data: { ...exercise.data, retryIncorrectAnswers: false } });
    mockEditingContent = { ...exercise, ...mockUpdateContent.mock.calls[0][0] };
    view.rerender(<Editor />);
    expect(screen.getByRole('checkbox', { name: 'Repeat incorrect words until correct' })).not.toBeChecked();
  });

  it('lets an admin choose a numeric count or every eligible pool word', () => {
    render(<Editor />);

    const countInput = screen.getByLabelText('Number of Questions');
    expect(countInput).toHaveValue(5);

    fireEvent.change(countInput, { target: { value: '10' } });
    fireEvent.blur(countInput);
    expect(updateConfig).toHaveBeenCalledWith({ count: 10 });

    const allWords = screen.getByRole('checkbox', { name: 'Use every eligible word in the pool' });
    expect(allWords).not.toBeChecked();
    fireEvent.click(allWords);
    expect(updateConfig).toHaveBeenLastCalledWith({ count: 'all' });

    expect(screen.queryByLabelText('Pool Word Limit')).not.toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton')).toHaveLength(numberFieldCount);
  });

  it('switches back to a numeric count when every-word mode is turned off', () => {
    mockCount = 'all';
    render(<Editor />);
    const allWords = screen.getByRole('checkbox', { name: 'Use every eligible word in the pool' });
    expect(allWords).toBeChecked();
    fireEvent.click(allWords);
    expect(updateConfig).toHaveBeenLastCalledWith({ count: 5 });
  });

  it('uses the whole pool when an admin switches the word source to a pool', () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole('button', { name: 'Vocabulary Pool' }));
    expect(updateConfig).toHaveBeenLastCalledWith({ wordSource: 'pool', count: 'all' });
  });

  it('does not carry an every-word count over to custom filters', () => {
    mockCount = 'all';
    render(<Editor />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom Filters' }));
    expect(updateConfig).toHaveBeenLastCalledWith({ wordSource: 'filters', count: 5 });
  });

  it('keeps a numeric count when an admin switches to custom filters', () => {
    mockCount = 40;
    render(<Editor />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom Filters' }));
    expect(updateConfig).toHaveBeenLastCalledWith({ wordSource: 'filters', count: 40 });
  });
});

describe('generated morphology unique word limit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditingContent = formExercise;
    mockCount = 30;
    mockUniqueWordCount = null;
  });

  const commitUniqueWords = (value: string) => {
    const input = screen.getByLabelText('Unique Words');
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
    return input;
  };

  it('is not offered for generated translation', () => {
    mockEditingContent = translationExercise;
    render(<GeneratedTranslationEditor />);
    expect(screen.queryByLabelText('Unique Words')).not.toBeInTheDocument();
  });

  it('saves a limit and clamps it to the question count', () => {
    render(<GeneratedFormIdentificationEditor />);
    expect(screen.getByLabelText('Unique Words')).toHaveValue(null);
    commitUniqueWords('10');
    expect(mockFormUpdateConfig).toHaveBeenLastCalledWith({ uniqueWordCount: 10 });
    expect(commitUniqueWords('50')).toHaveValue(30);
    expect(mockFormUpdateConfig).toHaveBeenLastCalledWith({ uniqueWordCount: 30 });
  });

  it('clears the limit when the field is emptied', () => {
    mockUniqueWordCount = 10;
    render(<GeneratedFormIdentificationEditor />);
    expect(screen.getByLabelText('Unique Words')).toHaveValue(10);
    commitUniqueWords('');
    expect(mockFormUpdateConfig).toHaveBeenCalledWith({ uniqueWordCount: null });
  });

  it.each(['0', '-2', '1.5'])('does not commit an invalid limit of %s', value => {
    mockUniqueWordCount = 10;
    render(<GeneratedFormIdentificationEditor />);
    expect(commitUniqueWords(value)).toHaveValue(10);
    expect(mockFormUpdateConfig).not.toHaveBeenCalled();
  });

  it('keeps a saved limit within the question count whenever the config is normalized', () => {
    expect(ensureGeneratorConfig({ wordSource: 'pool', count: 5, uniqueWordCount: 10 }).uniqueWordCount).toBe(5);
    expect(ensureGeneratorConfig({ wordSource: 'pool', count: 20, uniqueWordCount: 10 }).uniqueWordCount).toBe(10);
    expect(ensureGeneratorConfig({ wordSource: 'pool', count: 'all', uniqueWordCount: 10 }).uniqueWordCount).toBe(10);
  });

  it('is disabled for saved all-word exercises', () => {
    mockCount = 'all';
    render(<GeneratedFormIdentificationEditor />);
    expect(screen.getByLabelText('Unique Words')).toBeDisabled();
  });
});

describe('saved pool count compatibility', () => {
  it('keeps an every-word exercise until an admin enters a number', () => {
    mockEditingContent = formExercise;
    mockCount = 'all';
    mockFormUpdateConfig.mockClear();
    render(<GeneratedFormIdentificationEditor />);
    const countInput = screen.getByLabelText('Number of Questions');
    expect(countInput).toBeEnabled();
    expect(countInput).toHaveValue(null);
    fireEvent.blur(countInput);
    expect(mockFormUpdateConfig).not.toHaveBeenCalled();
    fireEvent.change(countInput, { target: { value: '30' } });
    fireEvent.blur(countInput);
    expect(mockFormUpdateConfig).toHaveBeenCalledWith({ count: 30 });
  });

  it.each(['', '0', '-2', '1.5'])('does not commit an invalid count of %s', value => {
    mockEditingContent = formExercise;
    mockCount = 30;
    mockFormUpdateConfig.mockClear();
    render(<GeneratedFormIdentificationEditor />);
    const countInput = screen.getByLabelText('Number of Questions');
    fireEvent.change(countInput, { target: { value } });
    fireEvent.blur(countInput);
    expect(mockFormUpdateConfig).not.toHaveBeenCalled();
    expect(countInput).toHaveValue(30);
  });

  it('accepts question counts above the old 200 ceiling and clamps at the supported maximum', () => {
    mockEditingContent = formExercise;
    mockCount = 5;
    mockFormUpdateConfig.mockClear();
    render(<GeneratedFormIdentificationEditor />);
    const countInput = screen.getByLabelText('Number of Questions');
    fireEvent.change(countInput, { target: { value: '500' } });
    fireEvent.blur(countInput);
    expect(mockFormUpdateConfig).toHaveBeenLastCalledWith({ count: 500 });
    fireEvent.change(countInput, { target: { value: String(MAX_GENERATED_WORD_COUNT + 1) } });
    fireEvent.blur(countInput);
    expect(mockFormUpdateConfig).toHaveBeenCalledWith({ count: MAX_GENERATED_WORD_COUNT });
  });

  it('drops the retired pool cap when updating a saved generator config', () => {
    const savedConfig = { wordSource: 'pool' as const, count: 30, poolWordLimit: 5 };
    expect(ensureGeneratorConfig(savedConfig)).toMatchObject({ wordSource: 'pool', count: 30 });
    expect(ensureGeneratorConfig(savedConfig)).not.toHaveProperty('poolWordLimit');
    expect(savedConfig.poolWordLimit).toBe(5);
  });
});
