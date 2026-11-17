import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VocabularyAIRulesDialog } from '@/src/components/ui/admin/vocabulary/VocabularyAIRulesDialog';
import type { VocabularyAIGuidanceSettings } from '@/shared/types/vocabulary/ai-guidance-settings';

const mockSave = jest.fn();
const mockRefetch = jest.fn();
let mockSettings: VocabularyAIGuidanceSettings;
jest.mock('@/src/store/api/vocabularyAIGuidanceApi', () => ({
  useGetVocabularyAIGuidanceQuery: () => ({ data: mockSettings, refetch: mockRefetch, isLoading: false }),
  useSaveVocabularyAIGuidanceMutation: () => [mockSave, { isLoading: false }],
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));

const open = () => fireEvent.click(screen.getByRole('button', { name: 'AI rules' }));
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => 'new-rule' });
  mockSettings = {
    revision: 3,
    rules: [{ id: 'r1', instruction: 'Keep defective forms empty.' }],
    updatedAt: null,
    updatedBy: null,
  };
  mockSave.mockReturnValue({ unwrap: async () => ({ ...mockSettings, revision: 4 }) });
});

it('stays out of the way until opened, then saves edits against the revision the admin opened', async () => {
  render(<VocabularyAIRulesDialog />);
  expect(screen.queryByLabelText('Rule 1')).toBeNull();
  open();
  expect(screen.getByRole('button', { name: 'Save rules' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Rule 1'), { target: { value: 'Preserve irregular forms.' } });
  save();
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith({
      revision: 3,
      rules: [{ id: 'r1', instruction: 'Preserve irregular forms.' }],
    })
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('keeps a stale draft until the admin explicitly discards it and reloads', async () => {
  mockSave.mockReturnValue({
    unwrap: async () => {
      throw { data: { error: 'Global guidance changed. Reload it before saving your changes.' } };
    },
  });
  const view = render(<VocabularyAIRulesDialog />);
  open();
  fireEvent.change(screen.getByLabelText('Rule 1'), { target: { value: 'My unsaved rule.' } });
  mockSettings = { ...mockSettings, revision: 4, rules: [{ id: 'r2', instruction: 'Another admin rule.' }] };
  view.rerender(<VocabularyAIRulesDialog />);
  expect(screen.getByLabelText('Rule 1')).toHaveValue('My unsaved rule.');
  save();
  expect(await screen.findByRole('alert')).toHaveTextContent('Global guidance changed.');
  expect(mockSave).toHaveBeenCalledWith({ revision: 3, rules: [{ id: 'r1', instruction: 'My unsaved rule.' }] });
  mockRefetch.mockResolvedValue({ data: mockSettings });
  fireEvent.click(screen.getByRole('button', { name: 'Discard my changes and reload' }));
  await waitFor(() => expect(screen.getByLabelText('Rule 1')).toHaveValue('Another admin rule.'));
});

it('removes or adds a rule only on Save, and Cancel discards the change', async () => {
  render(<VocabularyAIRulesDialog />);
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Remove rule 1' }));
  expect(mockSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  open();
  expect(screen.getByLabelText('Rule 1')).toHaveValue('Keep defective forms empty.');

  fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
  expect(screen.getByRole('button', { name: 'Save rules' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Rule 2'), { target: { value: 'Use Classical spelling.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove rule 1' }));
  save();
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith({
      revision: 3,
      rules: [{ id: expect.any(String), instruction: 'Use Classical spelling.' }],
    })
  );
});
