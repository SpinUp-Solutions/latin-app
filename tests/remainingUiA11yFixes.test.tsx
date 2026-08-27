import React from 'react';
import { render, screen } from '@testing-library/react';
import { OffscreenSlide } from '@/src/components/ui/core/offscreen-slide';
import { VocabularyFiltersComponent } from '@/src/components/ui/admin/vocabulary/VocabularyFilters';

describe('All Words search layout', () => {
  it('keeps the search field full width instead of collapsing beside filters', () => {
    render(
      <VocabularyFiltersComponent
        filters={{ wordType: 'all', search: '' }}
        wordTypeCounts={{}}
        countsLoading={false}
        onFiltersChange={jest.fn()}
        onSearch={jest.fn()}
        onReset={jest.fn()}
      />
    );

    const search = screen.getByLabelText('Search Words');
    expect(search).toHaveClass('min-w-0', 'flex-1', 'h-11');
    expect(search.parentElement).toHaveClass('w-full', 'min-w-0');
  });
});

describe('off-screen carousel slides', () => {
  it('removes hidden slide actions from the tab and accessibility trees', () => {
    render(
      <>
        <OffscreenSlide isVisible>
          <button type="button">Visible lesson</button>
        </OffscreenSlide>
        <OffscreenSlide isVisible={false}>
          <button type="button">Hidden lesson</button>
        </OffscreenSlide>
      </>
    );

    expect(screen.getByRole('button', { name: 'Visible lesson' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hidden lesson' })).not.toBeInTheDocument();
    expect(screen.getByText('Hidden lesson').closest('[inert]')).toHaveAttribute('inert');
  });
});
