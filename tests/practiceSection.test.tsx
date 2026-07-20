import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PracticeSection } from '@/src/components/ui/core/PracticeSection';
import type { LessonWithProgress } from '@/src/types/lesson';
import type { PracticeCategory } from '@/src/types/practice-category';

const makeCategory = (
  id: string,
  name: string,
  lessonType: PracticeCategory['lessonType'],
  categoryOrder: number,
  description?: string
): PracticeCategory => ({
  id,
  name,
  normalizedName: name.toLocaleLowerCase(),
  lessonType,
  description,
  status: 'active',
  categoryOrder,
  createdAt: '2026-07-14T00:00:00.000Z',
  createdBy: 'admin',
  updatedAt: '2026-07-14T00:00:00.000Z',
  updatedBy: 'admin',
});

const makeLesson = (
  id: string,
  title: string,
  type: LessonWithProgress['type'],
  overrides: Partial<LessonWithProgress> = {}
): LessonWithProgress => ({
  id,
  title,
  type,
  description: '',
  pages: [],
  isLive: true,
  liveOrder: 0,
  publishedAt: '2026-07-14T00:00:00.000Z',
  publishedBy: 'admin',
  status: 'available',
  progress: 0,
  ...overrides,
});

const gridLessonNames = () =>
  within(screen.getByTestId('practice-lesson-grid'))
    .getAllByRole('button')
    .map(button => button.getAttribute('aria-label'));

describe('PracticeSection', () => {
  it('uses type then category filtering and applies each category curated order', async () => {
    const user = userEvent.setup();
    const authors = makeCategory('authors', 'Authors', 'vocab', 0, 'Practice vocabulary by author.');
    const themes = makeCategory('themes', 'Themes', 'vocab', 1);
    const lessons = [
      makeLesson('uncategorized', 'General review', 'vocab', { liveOrder: 0 }),
      makeLesson('caesar', 'Caesar vocabulary', 'vocab', {
        liveOrder: 1,
        practiceCategories: [authors],
        practiceCategoryPlacements: [{ categoryId: authors.id, lessonOrder: 1 }],
      }),
      makeLesson('virgil', 'Virgil vocabulary', 'vocab', {
        liveOrder: 2,
        practiceCategories: [authors, themes],
        practiceCategoryPlacements: [
          { categoryId: authors.id, lessonOrder: 0 },
          { categoryId: themes.id, lessonOrder: 0 },
        ],
      }),
    ];

    render(<PracticeSection lessons={lessons} onLessonClick={jest.fn()} />);

    expect(gridLessonNames()).toEqual([
      'Start practice: General review',
      'Start practice: Caesar vocabulary',
      'Start practice: Virgil vocabulary',
    ]);

    const categories = screen.getByRole('radiogroup', { name: 'Vocabulary categories' });
    await user.click(within(categories).getByRole('radio', { name: /Authors/ }));

    expect(screen.getByRole('heading', { name: 'Authors' })).toBeInTheDocument();
    expect(screen.getByText('Practice vocabulary by author.')).toBeInTheDocument();
    expect(gridLessonNames()).toEqual(['Start practice: Virgil vocabulary', 'Start practice: Caesar vocabulary']);
    expect(screen.queryByRole('button', { name: 'Start practice: General review' })).not.toBeInTheDocument();

    await user.click(within(categories).getByRole('radio', { name: /Themes/ }));
    expect(gridLessonNames()).toEqual(['Start practice: Virgil vocabulary']);
  });

  it('defaults to the first non-empty type and resets the category and search when type changes', async () => {
    const user = userEvent.setup();
    const syntax = makeCategory('syntax', 'Syntax', 'sentence-diagramming', 0);
    const lessons = [
      makeLesson('diagram-1', 'Diagram a clause', 'sentence-diagramming', {
        practiceCategories: [syntax],
        practiceCategoryPlacements: [{ categoryId: syntax.id, lessonOrder: 0 }],
      }),
      makeLesson('listening-1', 'Listen to Cicero', 'listening'),
    ];

    render(<PracticeSection lessons={lessons} onLessonClick={jest.fn()} />);

    expect(screen.getByRole('tab', { name: /Diagramming/ })).toHaveAttribute('aria-selected', 'true');
    const diagrammingCategories = screen.getByRole('radiogroup', { name: 'Sentence Diagramming categories' });
    await user.click(within(diagrammingCategories).getByRole('radio', { name: /Syntax/ }));
    await user.type(screen.getByRole('textbox', { name: 'Search Syntax' }), 'clause');

    await user.click(screen.getByRole('tab', { name: /Listening/ }));

    expect(screen.getByRole('tab', { name: /Listening/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: /Search All Listening practice/ })).toHaveValue('');
    expect(
      within(screen.getByRole('radiogroup', { name: 'Listening categories' })).getByRole('radio', {
        name: /All Practice/,
      })
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('searches plain-text content and renders start, continue, review, and progress states', async () => {
    const user = userEvent.setup();
    const onLessonClick = jest.fn();
    const lessons = [
      makeLesson('ready', 'Starter words', 'vocab', { description: '<p>Everyday nouns</p>' }),
      makeLesson('progress', 'Working words', 'vocab', {
        description: '<p>Words from <strong>Gaul</strong></p>',
        status: 'in-progress',
        progress: 42,
      }),
      makeLesson('done', 'Mastered words', 'vocab', { status: 'completed', progress: 100 }),
    ];

    render(<PracticeSection lessons={lessons} onLessonClick={onLessonClick} />);

    expect(screen.getByRole('button', { name: 'Start practice: Starter words' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue: Working words' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review: Mastered words' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Working words progress' })).toHaveAttribute('aria-valuenow', '42');

    const search = screen.getByRole('textbox', { name: /Search All Vocabulary practice/ });
    await user.type(search, 'Gaul');
    expect(gridLessonNames()).toEqual(['Continue: Working words']);
    expect(screen.queryByText('<strong>')).not.toBeInTheDocument();

    await user.clear(search);
    await user.click(screen.getByRole('button', { name: 'Continue: Working words' }));
    expect(onLessonClick).toHaveBeenCalledWith('progress');
  });
});
