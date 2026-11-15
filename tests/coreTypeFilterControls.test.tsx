import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VocabularyFiltersComponent } from '@/src/components/ui/admin/vocabulary/VocabularyFilters';
import { WordSourceSection } from '@/src/components/ui/admin/content-editor/WordSourceSection';

// Radix Select relies on pointer-capture and scrolling APIs that jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

const choose = async (option: string) => {
  await userEvent.click(screen.getByRole('combobox', { name: 'Core / Non-Core' }));
  await userEvent.click(screen.getByRole('option', { name: option }));
};

describe('core / non-core filter controls', () => {
  it('filters the vocabulary viewer and can be cleared from the active filters', async () => {
    const onFiltersChange = jest.fn();
    const viewer = (coreType: 'core' | 'non-core' | null) => (
      <VocabularyFiltersComponent
        filters={{ wordType: 'all', coreType, search: '' }}
        wordTypeCounts={{}}
        countsLoading={false}
        onFiltersChange={onFiltersChange}
        onSearch={jest.fn()}
        onReset={jest.fn()}
      />
    );
    const { rerender } = render(viewer(null));
    expect(screen.getByRole('button', { name: /Reset Filters/ })).toBeDisabled();

    await choose('Non-Core only');
    expect(onFiltersChange).toHaveBeenLastCalledWith({ coreType: 'non-core' });

    rerender(viewer('non-core'));
    expect(screen.getByRole('button', { name: /Reset Filters/ })).toBeEnabled();
    await userEvent.click(screen.getByTitle('Remove filter'));
    expect(onFiltersChange).toHaveBeenLastCalledWith({ coreType: null });
  });

  it('restricts a generated exercise for either word source', async () => {
    const onCoreTypeChange = jest.fn();
    const section = (value: 'filters' | 'pool', coreType: 'core' | null) => (
      <WordSourceSection
        value={value}
        onChange={jest.fn()}
        coreType={coreType}
        onCoreTypeChange={onCoreTypeChange}
        filtersContent={<p>filters</p>}
        poolContent={<p>pool</p>}
      />
    );
    const { rerender } = render(section('filters', null));

    await choose('Core only');
    expect(onCoreTypeChange).toHaveBeenLastCalledWith('core');

    rerender(section('pool', 'core'));
    expect(screen.getByRole('combobox', { name: 'Core / Non-Core' })).toHaveTextContent('Core only');
    await choose('Core and Non-Core');
    expect(onCoreTypeChange).toHaveBeenLastCalledWith(null);
  });
});
