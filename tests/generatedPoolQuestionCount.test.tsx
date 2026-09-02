import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { GeneratedTranslationEditor } from '@/src/components/ui/admin/content-editor/GeneratedTranslationEditor';
import { GeneratedFormIdentificationEditor } from '@/src/components/ui/admin/content-editor/GeneratedFormIdentificationEditor';

const mockTranslationUpdateConfig = jest.fn();
const mockFormUpdateConfig = jest.fn();
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
      count: 5,
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
    updateContent: jest.fn(),
  }),
}));

jest.mock('@/src/hooks/useFormIdentificationEditor', () => ({
  useFormIdentificationEditor: () => ({
    config: {
      collection: 'vocabulary_words_v5',
      wordSource: 'pool',
      poolId: 'pool-1',
      poolWordLimit: null,
      count: 5,
    },
    derivedFilters: { partOfSpeech: 'all' },
    derivedFormSelection: undefined,
    handleGlobalFiltersChange: jest.fn(),
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
    updateContent: jest.fn(),
  }),
}));

jest.mock('@/src/components/ui/admin/content-editor/WordSourceSection', () => ({
  WordSourceSection: ({ poolContent }: { poolContent: React.ReactNode }) => <div>{poolContent}</div>,
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

jest.mock('@/src/components/ui/admin/vocabulary/AdvancedFiltersPanel', () => ({
  AdvancedFiltersPanel: () => null,
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
  ['generated translation', GeneratedTranslationEditor, translationExercise, mockTranslationUpdateConfig],
  ['generated morphology', GeneratedFormIdentificationEditor, formExercise, mockFormUpdateConfig],
] as const)('%s pool question count', (_label, Editor, exercise, updateConfig) => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditingContent = exercise;
  });

  it('lets an admin choose a numeric count or every eligible pool word', () => {
    render(<Editor />);

    const countInput = screen.getByLabelText('Number of Questions');
    expect(countInput).toHaveValue(5);

    fireEvent.change(countInput, { target: { value: '10' } });
    fireEvent.blur(countInput);
    expect(updateConfig).toHaveBeenCalledWith({ count: 10 });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Use all eligible pool words' }));
    expect(updateConfig).toHaveBeenCalledWith({ count: 'all' });
  });
});
