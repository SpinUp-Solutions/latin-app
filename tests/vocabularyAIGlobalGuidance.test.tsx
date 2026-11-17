import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VocabularyAIGlobalGuidance } from '@/src/components/ui/admin/vocabulary/VocabularyAIGlobalGuidance';
import type { VocabularyAIGuidanceSettings } from '@/shared/types/vocabulary/ai-guidance-settings';

const mockSave = jest.fn();
const mockRefetch = jest.fn();
let mockSettings: VocabularyAIGuidanceSettings;
jest.mock('@/src/store/api/vocabularyAIGuidanceApi', () => ({
  useGetVocabularyAIGuidanceQuery: () => ({ data: mockSettings, refetch: mockRefetch }),
  useSaveVocabularyAIGuidanceMutation: () => [mockSave, { isLoading: false }],
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
jest.mock('@/src/store/api/baseQuery', () => ({
  getApiErrorMessage: (error: { data?: { error?: string } }, fallback: string) => error?.data?.error || fallback,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings = {
    revision: 3,
    rules: [{ id: 'r1', instruction: 'Keep defective forms empty.' }],
    updatedAt: null,
    updatedBy: null,
  };
  mockSave.mockReturnValue({ unwrap: async () => ({ ...mockSettings, revision: 4 }) });
});

it('edits existing global guidance and submits the revision the admin opened', async () => {
  render(<VocabularyAIGlobalGuidance />);
  fireEvent.click(screen.getByText('Edit global guidance'));
  fireEvent.change(screen.getByLabelText('Global rule 1'), { target: { value: 'Preserve irregular forms.' } });
  fireEvent.click(screen.getByText('Save global guidance'));
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith({
      revision: 3,
      rules: [{ id: 'r1', instruction: 'Preserve irregular forms.' }],
    })
  );
  expect(await screen.findByText('Edit global guidance')).toBeInTheDocument();
});

it('keeps a stale draft until the admin explicitly discards it and reloads', async () => {
  mockSave.mockReturnValue({
    unwrap: async () => {
      throw { data: { error: 'Global guidance changed.' } };
    },
  });
  const view = render(<VocabularyAIGlobalGuidance />);
  fireEvent.click(screen.getByText('Edit global guidance'));
  fireEvent.change(screen.getByLabelText('Global rule 1'), { target: { value: 'My unsaved rule.' } });
  mockSettings = { ...mockSettings, revision: 4, rules: [{ id: 'r2', instruction: 'Another admin rule.' }] };
  view.rerender(<VocabularyAIGlobalGuidance />);
  expect(screen.getByLabelText('Global rule 1')).toHaveValue('My unsaved rule.');
  fireEvent.click(screen.getByText('Save global guidance'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Global guidance changed.');
  expect(mockSave).toHaveBeenCalledWith({ revision: 3, rules: [{ id: 'r1', instruction: 'My unsaved rule.' }] });
  mockRefetch.mockResolvedValue({ data: mockSettings });
  fireEvent.click(screen.getByText('Discard draft and reload global rules'));
  await waitFor(() => expect(screen.getByLabelText('Global rule 1')).toHaveValue('Another admin rule.'));
});

it('removes a global rule only after Save and can cancel a removal', async () => {
  render(<VocabularyAIGlobalGuidance />);
  fireEvent.click(screen.getByText('Edit global guidance'));
  fireEvent.click(screen.getByText('Remove rule 1'));
  expect(mockSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Cancel'));
  expect(screen.getByText('Keep defective forms empty.')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Edit global guidance'));
  fireEvent.click(screen.getByText('Remove rule 1'));
  fireEvent.click(screen.getByText('Save global guidance'));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ revision: 3, rules: [] }));
});
