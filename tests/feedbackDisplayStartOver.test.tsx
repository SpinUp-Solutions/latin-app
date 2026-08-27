import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FeedbackDisplay } from '@/src/components/ui/feedback/feedback-display';

describe('FeedbackDisplay start over', () => {
  it('renders Start over without message or escalation content', () => {
    const onStartOver = jest.fn();

    render(
      <FeedbackDisplay
        isCorrect={null}
        message=""
        onStartOver={onStartOver}
      />
    );

    expect(screen.getByText(/too many mistakes on this question/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start over/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /start over/i }));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });
});
