import React from 'react';
import { render, screen } from '@testing-library/react';
import { OffscreenSlide } from '@/src/components/ui/core/offscreen-slide';

describe('OffscreenSlide', () => {
  it('lets visible card transforms and shadows paint outside the wrapper', () => {
    render(
      <OffscreenSlide isVisible>
        <div data-testid="card">Lesson</div>
      </OffscreenSlide>
    );

    const wrapper = screen.getByTestId('card').parentElement;

    expect(wrapper).toHaveClass('overflow-visible');
    expect(wrapper).not.toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps an offscreen card out of the accessibility tree', () => {
    render(
      <OffscreenSlide isVisible={false}>
        <div data-testid="card">Lesson</div>
      </OffscreenSlide>
    );

    const wrapper = screen.getByTestId('card').parentElement;

    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(wrapper).toHaveAttribute('inert');
  });
});
