import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FeedbackBanner } from '@/src/components/ui/core/feedback-banner';
import { StudentFeedbackFooter } from '@/src/components/ui/core/student-feedback-footer';
import { FEEDBACK_FORM_URL } from '@/src/constants/student-feedback';

describe('student feedback access', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('hides the dismissible banner after close and keeps it hidden on remount', async () => {
    const { unmount } = render(<FeedbackBanner />);

    expect(await screen.findByRole('link', { name: 'Share your feedback' })).toHaveAttribute(
      'href',
      FEEDBACK_FORM_URL
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss feedback banner' }));
    expect(screen.queryByRole('link', { name: 'Share your feedback' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('feedback_banner_dismissed')).toBe('true');

    unmount();
    render(<FeedbackBanner />);
    await expect(
      screen.findByRole('link', { name: 'Share your feedback' }, { timeout: 200 })
    ).rejects.toThrow();
  });

  it('keeps a homepage footer link after the banner is dismissed', async () => {
    render(
      <>
        <FeedbackBanner />
        <StudentFeedbackFooter />
      </>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Dismiss feedback banner' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss feedback banner' }));

    expect(screen.getByRole('link', { name: 'Share your feedback' })).toHaveAttribute(
      'href',
      FEEDBACK_FORM_URL
    );
  });
});
