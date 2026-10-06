import React, { Activity } from 'react';
import { render } from '@testing-library/react';
import { FeedbackDisplay } from '@/src/components/ui/feedback/feedback-display';

const scrollIntoView = jest.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

it('brings feedback into view when it appears and when it changes', () => {
  const view = render(<FeedbackDisplay isCorrect={null} message="" />);
  expect(scrollIntoView).not.toHaveBeenCalled();

  view.rerender(<FeedbackDisplay isCorrect={false} message="Try again" />);
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', behavior: 'smooth' });
  expect(scrollIntoView.mock.instances[0]).toHaveTextContent('Try again');
  expect(scrollIntoView.mock.instances[0]).toHaveClass('scroll-mb-28');

  view.rerender(<FeedbackDisplay isCorrect={false} message="Try again" />);
  expect(scrollIntoView).toHaveBeenCalledTimes(1);

  view.rerender(
    <FeedbackDisplay isCorrect={false} message="Try again" allowContinueOnIncorrect onContinue={jest.fn()} />
  );
  expect(scrollIntoView).toHaveBeenCalledTimes(2);

  view.rerender(<FeedbackDisplay isCorrect={null} message="" />);
  expect(scrollIntoView).toHaveBeenCalledTimes(2);
});

it('leaves feedback alone when it is already showing as the page opens or returns', () => {
  const viewAt = (mode: 'visible' | 'hidden') => (
    <Activity mode={mode}>
      <FeedbackDisplay isCorrect message="Correct!" onContinue={jest.fn()} />
    </Activity>
  );
  const view = render(viewAt('visible'));
  view.rerender(viewAt('hidden'));
  view.rerender(viewAt('visible'));
  expect(scrollIntoView).not.toHaveBeenCalled();
});
