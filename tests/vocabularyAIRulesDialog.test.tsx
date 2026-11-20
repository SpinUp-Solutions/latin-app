import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VocabularyAIRulesDialog } from '@/src/components/ui/admin/vocabulary/VocabularyAIRulesDialog';
import type { VocabularyAIGuidanceSettings } from '@/shared/types/vocabulary/ai-guidance-settings';
import { AI_REVIEW_ITEM_LIMIT } from '@/shared/types/vocabulary/ai-review';

const mockSave = jest.fn();
const mockRefetch = jest.fn();
let mockSettings: VocabularyAIGuidanceSettings;
let mockLoading = false;
jest.mock('@/src/store/api/vocabularyAIGuidanceApi', () => ({
  useGetVocabularyAIGuidanceQuery: () => ({
    data: mockLoading ? undefined : mockSettings,
    refetch: mockRefetch,
    isLoading: mockLoading,
  }),
  useSaveVocabularyAIGuidanceMutation: () => [mockSave, { isLoading: false }],
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));

const open = () => fireEvent.click(screen.getByRole('button', { name: 'AI rules' }));
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));

beforeEach(() => {
  jest.clearAllMocks();
  mockLoading = false;
  let uuid = 0;
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => `added-${++uuid}` });
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

it('removes a rule only on Save, and Cancel discards the change', async () => {
  render(<VocabularyAIRulesDialog />);
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Remove rule 1' }));
  expect(mockSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  open();
  expect(screen.getByLabelText('Rule 1')).toHaveValue('Keep defective forms empty.');

  fireEvent.click(screen.getByRole('button', { name: 'Remove rule 1' }));
  save();
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ revision: 3, rules: [] }));
});

it('shows where the AI learned each rule and keeps that source when the rule is edited', async () => {
  const learnedFrom = { word: 'rosa', message: 'No locative: only place names have one.' };
  mockSettings = {
    ...mockSettings,
    rules: [{ id: 'learned', instruction: 'Give locatives only for place names.', learnedFrom }],
  };
  render(<VocabularyAIRulesDialog />);
  open();
  expect(screen.getByText(/Learned from an answer about/)).toHaveTextContent(
    'Learned from an answer about rosa: “No locative: only place names have one.”'
  );
  fireEvent.change(screen.getByLabelText('Rule 1'), { target: { value: 'Give locatives only for towns.' } });
  save();
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith({
      revision: 3,
      rules: [{ id: 'learned', instruction: 'Give locatives only for towns.', learnedFrom }],
    })
  );
});

it('shows the shape of the rules while they load, with nothing to edit or save yet', () => {
  mockLoading = true;
  render(<VocabularyAIRulesDialog />);
  open();
  expect(screen.getByRole('status', { name: 'Loading rules' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Rule 1')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save rules' })).toBeNull();
});

it('explains where rules come from when there are none', () => {
  mockSettings = { ...mockSettings, rules: [] };
  render(<VocabularyAIRulesDialog />);
  open();
  expect(screen.getByText(/Add one below, or answer the AI about a word/)).toBeInTheDocument();
});

describe('rules an admin adds', () => {
  const newRule = () => screen.getByLabelText('Add your own rule');
  const addButton = () => screen.getByRole('button', { name: 'Add rule' });

  it('adds a rule beside the learned ones and saves it with the rest', async () => {
    render(<VocabularyAIRulesDialog />);
    open();
    expect(screen.getByText('Added by an admin.')).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
    fireEvent.change(newRule(), { target: { value: '  Leave the vocative empty when it matches the nominative.  ' } });
    fireEvent.click(addButton());

    expect(newRule()).toHaveValue('');
    expect(screen.getByLabelText('Rule 2')).toHaveValue('Leave the vocative empty when it matches the nominative.');
    expect(screen.getByText('New. Saved when you click Save rules.')).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
    save();
    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith({
        revision: 3,
        rules: [
          { id: 'r1', instruction: 'Keep defective forms empty.' },
          { id: 'added-1', instruction: 'Leave the vocative empty when it matches the nominative.' },
        ],
      })
    );
  });

  it('adds on Enter, keeps Shift+Enter for a new line, and saves a rule typed but not added', async () => {
    render(<VocabularyAIRulesDialog />);
    open();
    fireEvent.change(newRule(), { target: { value: 'First rule.' } });
    fireEvent.keyDown(newRule(), { key: 'Enter', shiftKey: true });
    expect(screen.queryByLabelText('Rule 2')).toBeNull();
    fireEvent.keyDown(newRule(), { key: 'Enter' });
    expect(screen.getByLabelText('Rule 2')).toHaveValue('First rule.');

    // Typed, never added: Save rules keeps it rather than dropping it.
    fireEvent.change(newRule(), { target: { value: 'Second rule.' } });
    save();
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][0].rules.map((rule: { instruction: string }) => rule.instruction)).toEqual([
      'Keep defective forms empty.',
      'First rule.',
      'Second rule.',
    ]);
    const ids = mockSave.mock.calls[0][0].rules.map((rule: { id: string }) => rule.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('saves a typed rule on its own, with nothing else changed', async () => {
    render(<VocabularyAIRulesDialog />);
    open();
    expect(screen.getByRole('button', { name: 'Save rules' })).toBeDisabled();
    fireEvent.change(newRule(), { target: { value: 'Mark poetic forms.' } });
    save();
    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith({
        revision: 3,
        rules: [
          { id: 'r1', instruction: 'Keep defective forms empty.' },
          { id: 'added-1', instruction: 'Mark poetic forms.' },
        ],
      })
    );
  });

  it('points to the rule that already says the same thing', () => {
    render(<VocabularyAIRulesDialog />);
    open();
    fireEvent.change(newRule(), { target: { value: 'keep   defective forms EMPTY' } });
    expect(screen.getByText('Rule 1 already says this.')).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save rules' })).toBeDisabled();
  });

  it('stops at the rule limit until one is removed', () => {
    mockSettings = {
      ...mockSettings,
      rules: Array.from({ length: AI_REVIEW_ITEM_LIMIT }, (_, index) => ({
        id: `r${index}`,
        instruction: `Rule number ${index}.`,
      })),
    };
    render(<VocabularyAIRulesDialog />);
    open();
    expect(newRule()).toBeDisabled();
    expect(
      screen.getByText(`${AI_REVIEW_ITEM_LIMIT} rules is the limit. Remove one to add another.`)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove rule 1' }));
    expect(newRule()).toBeEnabled();
  });
});
