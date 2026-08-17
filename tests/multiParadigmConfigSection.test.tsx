import { fireEvent, render, screen } from '@testing-library/react';
import { MultiParadigmConfigSection } from '@/src/components/ui/admin/content-editor/MultiParadigmConfigSection';

describe('MultiParadigmConfigSection compatibility feedback', () => {
  it('shows a non-blocking grouped warning for skipped forms', () => {
    render(
      <MultiParadigmConfigSection
        availableParadigms={['verb-conjugation']}
        paradigmWordCounts={{ 'verb-conjugation': 2 }}
        paradigmConfigs={{
          'verb-conjugation': {
            enabled: true,
            filters: {},
            formSelection: {
              tableType: 'conjugation',
              selectedCellPaths: ['indicative.active.present.singular.first', 'gerund.genitive'],
            },
            steps: ['mood'],
          },
        }}
        onUpdateParadigmConfig={jest.fn()}
        onToggleParadigm={jest.fn()}
      />
    );

    const warning = screen.getByText('Some selected forms will be skipped').closest('[role="status"]');
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent(/1 gerund form will not appear/);
    expect(warning).toHaveTextContent(/Add Conjugation, Verb form, or Case to include it/);
  });

  it('does not turn a partial warning into a disabled authoring control', () => {
    const onUpdate = jest.fn();
    render(
      <MultiParadigmConfigSection
        availableParadigms={['verb-conjugation']}
        paradigmConfigs={{
          'verb-conjugation': {
            enabled: true,
            filters: {},
            formSelection: {
              tableType: 'conjugation',
              selectedCellPaths: ['indicative.active.present.singular.first', 'gerund.genitive'],
            },
            steps: ['mood'],
          },
        }}
        onUpdateParadigmConfig={onUpdate}
        onToggleParadigm={jest.fn()}
      />
    );

    expect(screen.getByText('Enabled')).toBeEnabled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('marks skipped forms on an inactive paradigm tab and explains them when selected', () => {
    render(
      <MultiParadigmConfigSection
        availableParadigms={['noun-declension', 'verb-conjugation']}
        paradigmConfigs={{
          'noun-declension': {
            enabled: true,
            filters: {},
            formSelection: {
              tableType: 'declension',
              selectedCellPaths: ['nominative.singular'],
            },
            steps: ['case'],
          },
          'verb-conjugation': {
            enabled: true,
            filters: {},
            formSelection: {
              tableType: 'conjugation',
              selectedCellPaths: ['indicative.active.present.singular.first', 'gerund.genitive'],
            },
            steps: ['mood'],
          },
        }}
        onUpdateParadigmConfig={jest.fn()}
        onToggleParadigm={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Verb Conjugation.*1 skipped/ })).toBeInTheDocument();
    expect(screen.queryByText('Some selected forms will be skipped')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Verb Conjugation.*1 skipped/ }));

    expect(screen.getByText('Some selected forms will be skipped')).toBeInTheDocument();
    expect(screen.getByText('1 skipped')).toBeInTheDocument();
  });

  it('warns about unrecognized saved paths without blocking compatible forms', () => {
    render(
      <MultiParadigmConfigSection
        availableParadigms={['verb-conjugation']}
        paradigmConfigs={{
          'verb-conjugation': {
            enabled: true,
            filters: {},
            formSelection: {
              tableType: 'conjugation',
              selectedCellPaths: ['indicative.active.present.singular.first', 'legacy.saved.path'],
            },
            steps: ['mood'],
          },
        }}
        onUpdateParadigmConfig={jest.fn()}
        onToggleParadigm={jest.fn()}
      />
    );

    const warning = screen.getByText('Some selected forms will be skipped').closest('[role="status"]');
    expect(warning).toHaveTextContent('1 unrecognized saved form will be skipped');
    expect(screen.getByText('Enabled')).toBeEnabled();
  });
});
