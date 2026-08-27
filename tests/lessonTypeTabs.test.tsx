import { fireEvent, render, screen } from '@testing-library/react';
import { LessonTypeTabs } from '@/src/components/ui/admin/LessonTypeTabs';

describe('LessonTypeTabs keyboard access', () => {
  it('keeps Normal, Vocab, and Diagramming in the tab order', () => {
    const onValueChange = jest.fn();
    render(<LessonTypeTabs value="normal" onValueChange={onValueChange} />);

    for (const name of ['Normal', 'Vocab', 'Diagramming', 'Listening']) {
      expect(screen.getByRole('tab', { name: new RegExp(`^${name}`) })).toHaveAttribute('tabindex', '0');
    }

    fireEvent.click(screen.getByRole('tab', { name: /^Vocab/ }));
    expect(onValueChange).toHaveBeenCalledWith('vocab');
  });
});
