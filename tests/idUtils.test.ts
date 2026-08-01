import { regenerateContentIds, regeneratePageIds } from '@/src/utils/idUtils';
import {
  createAnnotationId,
  createSentenceDiagramFeedbackContent,
  tokenizeDiagramSentence,
} from '@/src/features/sentence-diagramming/model';
import { validateSentenceDiagramDocument } from '@/src/features/sentence-diagramming/validation';

describe('ID regeneration', () => {
  it('regenerates nested exercise IDs and preserves their internal references without changing semantic strings', () => {
    const content = {
      id: 'exercise-1',
      type: 'matching',
      data: {
        leftColumn: [{ id: 'left-1', value: 'amo' }],
        rightColumn: [{ id: 'right-1', value: 'love' }],
        answers: { 'left-1': 'right-1' },
        pairs: [{ id: 'pair-1', sourceId: 'left-1', targetId: 'right-1' }],
        wordId: 'left-1',
        note: 'left-1',
      },
    } as never;
    const source = JSON.parse(JSON.stringify(content));

    const { content: copy, idMapping } = regenerateContentIds(content);
    const data = (copy as unknown as { data: Record<string, unknown> }).data;
    const left = (data.leftColumn as Array<{ id: string }>)[0];
    const right = (data.rightColumn as Array<{ id: string }>)[0];
    const pair = (data.pairs as Array<{ id: string; sourceId: string; targetId: string }>)[0];

    expect(copy.id).toBe(idMapping['exercise-1']);
    expect(left.id).toBe(idMapping['left-1']);
    expect(right.id).toBe(idMapping['right-1']);
    expect(pair.id).toBe(idMapping['pair-1']);
    expect(pair).toMatchObject({ sourceId: left.id, targetId: right.id });
    expect(data.answers).toEqual({ [left.id]: right.id });
    expect(data.wordId).toBe('left-1');
    expect(data.note).toBe('left-1');
    expect(content).toEqual(source);
  });

  it('regenerates a page and all of its item identities without mutating the source', () => {
    const page = {
      id: 'page-1',
      title: 'Practice',
      items: [
        { id: 'multiple-choice-1', type: 'multiple-choice', data: { options: [{ id: 'choice-1', text: 'A' }] } },
        { id: 'table-fill-1', type: 'table-fill', data: { columns: [{ id: 'column-2', header: 'H' }], rows: [{ id: 'row-2', cells: { 'column-2': { content: 'x', isBlank: true } } }] } },
      ],
    } as never;
    const source = JSON.parse(JSON.stringify(page));

    const { page: copy } = regeneratePageIds(page, {});
    const items = copy.items as unknown as Array<{ id: string; data: Record<string, unknown> }>;
    const choice = (items[0].data.options as Array<{ id: string }>)[0];
    const column = (items[1].data.columns as Array<{ id: string }>)[0];
    const row = (items[1].data.rows as Array<{ id: string; cells: Record<string, unknown> }>)[0];

    expect(copy.id).not.toBe('page-1');
    expect(items.map(item => item.id)).not.toEqual(['multiple-choice-1', 'table-fill-1']);
    expect(choice.id).not.toBe('choice-1');
    expect(row.id).not.toBe('row-2');
    expect(Object.keys(row.cells)).toEqual([column.id]);
    expect(page).toEqual(source);
  });

  it('regenerates authored identities for every other content schema that declares them', () => {
    const cases = [
      {
        content: { id: 'odd', type: 'odd-one-out', data: { items: [{ id: 'odd-item' }] } },
        copiedId: (copy: Record<string, unknown>) =>
          ((copy.data as { items: Array<{ id: string }> }).items[0].id),
        sourceId: 'odd-item',
      },
      {
        content: { id: 'selection', type: 'text-selection', data: { questions: [{ id: 'question-1' }] } },
        copiedId: (copy: Record<string, unknown>) =>
          ((copy.data as { questions: Array<{ id: string }> }).questions[0].id),
        sourceId: 'question-1',
      },
      {
        content: { id: 'vocabulary', type: 'vocabulary', vocabularyItems: [{ id: 'vocab-1' }] },
        copiedId: (copy: Record<string, unknown>) =>
          ((copy.vocabularyItems as Array<{ id: string }>)[0].id),
        sourceId: 'vocab-1',
      },
      {
        content: {
          id: 'table',
          type: 'table',
          tableData: {
            columns: [{ id: 'table-column' }],
            rows: [{ id: 'table-row', cells: { 'table-column': 'value' } }],
          },
        },
        copiedId: (copy: Record<string, unknown>) =>
          ((copy.tableData as { rows: Array<{ id: string }> }).rows[0].id),
        sourceId: 'table-row',
      },
    ];

    cases.forEach(({ content, copiedId, sourceId }) => {
      const { content: copy, idMapping } = regenerateContentIds(content as never);
      expect(copiedId(copy as unknown as Record<string, unknown>)).toBe(idMapping[sourceId]);
      expect(idMapping[sourceId]).not.toBe(sourceId);
    });

    const copiedTable = regenerateContentIds(cases[3].content as never).content as unknown as {
      tableData: { columns: Array<{ id: string }>; rows: Array<{ cells: Record<string, string> }> };
    };
    expect(Object.keys(copiedTable.tableData.rows[0].cells)).toEqual([copiedTable.tableData.columns[0].id]);
  });

  it('preserves canonical sentence-diagram token and annotation IDs', () => {
    const latin = 'amat';
    const tokens = tokenizeDiagramSentence(latin);
    const span = { startTokenIndex: 0, endTokenIndex: 0, startCharOffset: 0, endCharOffset: 4 };
    const annotation = { id: createAnnotationId('verb', span), kind: 'verb' as const, span };
    const feedback = {
      ...createSentenceDiagramFeedbackContent(latin),
      annotations: [annotation],
    };
    const content = {
      id: 'diagram-1',
      type: 'sentence-diagramming',
      data: {
        latin,
        translation: 'he loves',
        tokens,
        solutionAnnotations: [annotation],
        availableStudentTools: ['verb'],
        hint: feedback,
        explanation: feedback,
        difficulty: 'beginner',
      },
    } as never;
    const source = JSON.parse(JSON.stringify(content));

    const { content: copy } = regenerateContentIds(content);
    const copiedDocument = (copy as unknown as { data: typeof source.data }).data;

    expect(copy.id).not.toBe('diagram-1');
    expect(copiedDocument).toEqual(source.data);
    expect(validateSentenceDiagramDocument(copiedDocument)).toEqual([]);
    expect(content).toEqual(source);
  });
});
