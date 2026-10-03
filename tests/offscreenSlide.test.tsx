import React from 'react';
import { render, screen } from '@testing-library/react';
import { OffscreenSlide } from '@/src/components/ui/core/offscreen-slide';

describe('OffscreenSlide', () => {
  it('keeps a visible slide and its actions reachable', () => {
    render(
      <OffscreenSlide isVisible>
        <button type="button">Visible lesson</button>
      </OffscreenSlide>
    );

    const wrapper = screen.getByRole('button', { name: 'Visible lesson' }).parentElement;

    expect(wrapper).not.toHaveAttribute('aria-hidden', 'true');
    expect(wrapper).not.toHaveAttribute('inert');
  });

  it('removes an offscreen slide and its actions from the tab and accessibility trees', () => {
    render(
      <OffscreenSlide isVisible={false}>
        <button type="button">Hidden lesson</button>
      </OffscreenSlide>
    );

    const wrapper = screen.getByText('Hidden lesson').parentElement;

    expect(screen.queryByRole('button', { name: 'Hidden lesson' })).not.toBeInTheDocument();
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(wrapper).toHaveAttribute('inert');
  });
});
