import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockSubmit = jest.fn();
const mockClear = jest.fn();
let mockSelectedIds: string[] = [];

jest.mock('@/src/hooks/useWordSelection', () => ({
  useWordSelection: () => ({ selectedIds: mockSelectedIds, clear: mockClear }),
}));
jest.mock('@/src/components/ui/admin/vocabulary-pools/WordSelector', () => ({
  WordSelector: () => <div data-testid="word-selector" />,
}));
jest.mock('@/src/components/ui/admin/vocabulary-pools/VocabularyPoolImportSelector', () => ({
  VocabularyPoolImportSelector: ({
    onSelectionChange,
    disabled,
  }: {
    onSelectionChange: (ids: string[]) => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={() => onSelectionChange(['source-a'])}>
      Choose source
    </button>
  ),
}));

import { PoolForm } from '@/src/components/ui/admin/vocabulary-pools/PoolForm';

const fillRequiredFields = () => {
  fireEvent.change(screen.getByLabelText('Pool Name *'), { target: { value: 'Combined pool' } });
  fireEvent.change(screen.getByLabelText('Description *'), { target: { value: 'Copied words' } });
  fireEvent.click(screen.getByRole('button', { name: 'Choose source' }));
};

describe('PoolForm copy submission identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectedIds = [];
  });

  it('reuses the request ID for an identical retry and rotates it after payload changes', async () => {
    mockSubmit.mockResolvedValue(false);
    render(<PoolForm mode="create" onSubmit={mockSubmit} onCancel={jest.fn()} isLoading={false} />);
    fillRequiredFields();
    const form = screen.getByRole('button', { name: 'Create Pool' }).closest('form')!;

    fireEvent.submit(form);
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    fireEvent.submit(form);
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(2));
    expect(mockSubmit.mock.calls[0][0].requestId).toBe(mockSubmit.mock.calls[1][0].requestId);

    fireEvent.change(screen.getByLabelText('Pool Name *'), { target: { value: 'Changed pool' } });
    fireEvent.submit(form);
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(3));
    expect(mockSubmit.mock.calls[2][0].requestId).not.toBe(mockSubmit.mock.calls[1][0].requestId);
  });

  it('rotates the next request after an explicit server state reset while retaining selections', async () => {
    mockSubmit.mockResolvedValue(false);
    const { rerender } = render(
      <PoolForm
        mode="create"
        onSubmit={mockSubmit}
        onCancel={jest.fn()}
        isLoading={false}
        copyRequestResetVersion={0}
      />
    );
    fillRequiredFields();
    const form = screen.getByRole('button', { name: 'Create Pool' }).closest('form')!;
    fireEvent.submit(form);
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    const firstRequestId = mockSubmit.mock.calls[0][0].requestId;

    rerender(
      <PoolForm
        mode="create"
        onSubmit={mockSubmit}
        onCancel={jest.fn()}
        isLoading={false}
        copyRequestResetVersion={1}
      />
    );
    expect(screen.getByDisplayValue('Combined pool')).toBeInTheDocument();
    expect(screen.getByText('Choose source')).toBeInTheDocument();
    fireEvent.submit(form);
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(2));
    expect(mockSubmit.mock.calls[1][0].requestId).not.toBe(firstRequestId);
    expect(mockSubmit.mock.calls[1][0].sourcePoolIds).toEqual(['source-a']);
  });

  it('ignores rapid repeated submit events while the first request is in flight', async () => {
    let resolveSubmit!: (success: boolean) => void;
    mockSubmit.mockImplementation(
      () =>
        new Promise<boolean>(resolve => {
          resolveSubmit = resolve;
        })
    );
    render(<PoolForm mode="create" onSubmit={mockSubmit} onCancel={jest.fn()} isLoading={false} />);
    fillRequiredFields();
    const form = screen.getByRole('button', { name: 'Create Pool' }).closest('form')!;

    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    resolveSubmit(true);
    await waitFor(() => expect(mockClear).toHaveBeenCalledTimes(1));
  });
});
