import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PracticeSection } from '@/src/components/ui/core/PracticeSection';
import type { LessonWithProgress } from '@/src/types/lesson';
import type { PracticeCategory } from '@/src/types/practice-category';
import type { StudentMockTestSummary } from '@/src/types/test';

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
  tags: [],
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
  it('filters a selected category by its own tags with match-any semantics while All includes untagged lessons', async () => {
    const user = userEvent.setup();
    const baseAuthors = makeCategory('authors', 'Authors', 'vocab', 0);
    const authors: PracticeCategory = {
      ...baseAuthors,
      tags: [
        {
          id: 'cicero',
          name: 'Cicero',
          normalizedName: 'cicero',
          status: 'active',
          tagOrder: 0,
          createdAt: 'now',
          createdBy: 'admin',
          updatedAt: 'now',
          updatedBy: 'admin',
        },
        {
          id: 'virgil',
          name: 'Virgil',
          normalizedName: 'virgil',
          status: 'active',
          tagOrder: 1,
          createdAt: 'now',
          createdBy: 'admin',
          updatedAt: 'now',
          updatedBy: 'admin',
        },
        {
          id: 'caesar',
          name: 'Caesar',
          normalizedName: 'caesar',
          status: 'active',
          tagOrder: 2,
          createdAt: 'now',
          createdBy: 'admin',
          updatedAt: 'now',
          updatedBy: 'admin',
        },
        {
          id: 'archived-author',
          name: 'Archived author',
          normalizedName: 'archived author',
          status: 'archived',
          tagOrder: 3,
          createdAt: 'now',
          createdBy: 'admin',
          updatedAt: 'now',
          updatedBy: 'admin',
        },
      ],
    };
    const lessons = [
      makeLesson('general', 'General author review', 'vocab', {
        practiceCategories: [authors],
        practiceCategoryPlacements: [{ categoryId: authors.id, lessonOrder: 0, tagIds: [] }],
      }),
      makeLesson('cicero-lesson', 'Cicero vocabulary', 'vocab', {
        practiceCategories: [authors],
        practiceCategoryPlacements: [{ categoryId: authors.id, lessonOrder: 1, tagIds: ['cicero'] }],
      }),
      makeLesson('virgil-lesson', 'Virgil vocabulary', 'vocab', {
        practiceCategories: [authors],
        practiceCategoryPlacements: [{ categoryId: authors.id, lessonOrder: 2, tagIds: ['virgil'] }],
      }),
    ];

    render(<PracticeSection lessons={lessons} onLessonClick={jest.fn()} />);
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Vocabulary categories' })).getByRole('radio', {
        name: /Authors/,
      })
    );

    expect(screen.getByRole('button', { name: 'Show all Authors lessons' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /Caesar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Archived author/ })).not.toBeInTheDocument();
    expect(gridLessonNames()).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: /Cicero 1/ }));
    expect(gridLessonNames()).toEqual(['Start practice: Cicero vocabulary']);
    expect(screen.queryByRole('button', { name: 'Start practice: General author review' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Virgil 1/ }));
    expect(gridLessonNames()).toEqual(['Start practice: Cicero vocabulary', 'Start practice: Virgil vocabulary']);

    await user.click(screen.getByRole('button', { name: 'Show all Authors lessons' }));
    expect(gridLessonNames()).toHaveLength(3);
  });

  it('uses type then category filtering and applies each category curated order', async () => {
    const user = userEvent.setup();
    const authors = makeCategory('authors', 'Authors', 'vocab', 0, 'Practice vocabulary by author.');
    const themes = makeCategory('themes', 'Themes', 'vocab', 1);
    const lessons = [
      makeLesson('uncategorized', 'General review', 'vocab', { liveOrder: 0 }),
      makeLesson('caesar', 'Caesar vocabulary', 'vocab', {
        liveOrder: 1,
        practiceCategories: [authors],
        practiceCategoryPlacements: [{ categoryId: authors.id, lessonOrder: 1, tagIds: [] }],
      }),
      makeLesson('virgil', 'Virgil vocabulary', 'vocab', {
        liveOrder: 2,
        practiceCategories: [authors, themes],
        practiceCategoryPlacements: [
          { categoryId: authors.id, lessonOrder: 0, tagIds: [] },
          { categoryId: themes.id, lessonOrder: 0, tagIds: [] },
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
        practiceCategoryPlacements: [{ categoryId: syntax.id, lessonOrder: 0, tagIds: [] }],
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

  it('shows Mock Tests as a practice tab when live mock tests are available', async () => {
    const user = userEvent.setup();
    const onMockTestClick = jest.fn();
    const mock: StudentMockTestSummary = {
      id: 'mock-1',
      title: 'Chapter rehearsal',
      description: '',
      passingPercentage: 70,
      totalPoints: 10,
      attemptSummary: {
        origin: { kind: 'mock-test', mockTestId: 'mock-1' },
        inProgressAttemptId: null,
        attemptCount: 0,
        best: null,
        latest: null,
      },
      scoreTrend: [],
    };

    render(
      <PracticeSection
        lessons={[makeLesson('vocab-1', 'Starter words', 'vocab')]}
        onLessonClick={jest.fn()}
        mockTests={[mock]}
        onMockTestClick={onMockTestClick}
      />
    );

    const mockTestsTab = screen.getByRole('tab', { name: 'Mock Tests 1' });
    await user.click(mockTestsTab);

    expect(screen.getByRole('heading', { name: 'Mock Tests' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start Mock Test: Chapter rehearsal' }));
    expect(onMockTestClick).toHaveBeenCalledWith('mock-1');
  });
});
