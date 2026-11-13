import { render, screen } from '@testing-library/react';
import { TranslationGradingFeedback } from '@/src/components/ui/exercises/translation-grading-feedback';

describe('TranslationGradingFeedback', () => {
  it('shows markdown asterisks as emphasis and nests quotes inside the quoted notes', () => {
    const { container } = render(
      <TranslationGradingFeedback
        sourceLanguage="Latin"
        targetLanguage="English"
        data={{
          feedbackLevel: 'Very good',
          notes: 'Your *arma* is spot-on. victōs means "the defeated," not “the victors.”',
          suggestedText: 'Arms, men, bring arms.',
          breakdown: [
            {
              latinSegment: 'ferte arma',
              yourTranslation: 'bring arms',
              type: '✓',
              feedback: 'Correct **imperative**.',
            },
          ],
          grammaticalBreakdown: [],
        }}
      />
    );

    expect(container.textContent).not.toContain('*');
    expect(screen.getByText('arma').tagName).toBe('EM');
    expect(screen.getByText('imperative').tagName).toBe('EM');
    const notes = screen.getByText(/is spot-on/);
    expect(notes.textContent).toBe('“Your arma is spot-on. victōs means ‘the defeated,’ not ‘the victors.’”');
  });
});
