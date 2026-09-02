import { persistEvaluationRun } from '@/src/lib/ai-evaluations/persistence';
import type { EvaluationCase, EvaluationRunResult } from '@/src/lib/ai-evaluations/contracts';

type FakeReference = {
  id: string;
  path: string;
  collection: (name: string) => { doc: (id: string) => FakeReference };
};

const reference = (path: string, id: string): FakeReference => ({
  id,
  path,
  collection: name => ({ doc: childId => reference(`${path}/${name}/${childId}`, childId) }),
});

describe('AI evaluation run persistence', () => {
  it('stores aggregate history without copying source, answers, or cell output', async () => {
    const writes: Array<{ path: string; value: unknown }> = [];
    const db = {
      collection: (name: string) => ({
        doc: () => ({
          ...reference(`${name}/run-1`, 'run-1'),
          set: async (value: unknown) => writes.push({ path: `${name}/run-1`, value }),
        }),
      }),
    };
    const evaluationCase: EvaluationCase = {
      id: 'case-1',
      title: 'Regression case',
      direction: 'latin-to-english',
      sourceText: 'Gallia est omnis divisa.',
      answers: [
        {
          id: 'answer-1',
          label: 'Correct',
          text: 'All Gaul is divided.',
          expectations: { test: { minScore: 9, maxScore: 10 } },
        },
      ],
      modes: ['test'],
      createdAt: '2026-08-01T00:00:00.000Z',
      createdBy: 'admin',
      updatedAt: '2026-08-01T00:00:00.000Z',
      updatedBy: 'admin',
    };
    const result = {
      caseId: 'case-1',
      schemaVersion: 'ai-translation-evaluation-v3',
      forceRefresh: true,
      startedAt: '2026-08-01T00:00:00.000Z',
      completedAt: '2026-08-01T00:00:01.000Z',
      aggregate: {
        cellCount: 1,
        evaluatedCellCount: 1,
        failedCellCount: 0,
        criteriaEvaluatedCount: 1,
        criteriaPassedCount: 1,
        criteriaFailedCount: 0,
        appCacheHits: 0,
        openAIPromptCacheHits: 0,
        wallTimeMs: 1_000,
        generationTimeMs: 900,
        providerTimeThisRunMs: 900,
        originalCostStatus: 'measured',
        costIncurredThisRunStatus: 'measured',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        usageStatus: 'measured',
        usageIncurredThisRun: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        usageIncurredThisRunStatus: 'measured',
        unknownOriginalCostCells: 0,
        unknownIncurredCostCells: 0,
      },
      cells: [{ answerId: 'answer-1', optionalValue: undefined }],
    } as unknown as EvaluationRunResult;

    const persisted = await persistEvaluationRun(evaluationCase, result, 'admin-1', db as never);

    expect(persisted).toMatchObject({ runId: 'run-1', historySaved: true });
    expect(writes.map(write => write.path)).toEqual(['aiEvaluationRuns/run-1']);
    expect(writes[0].value).toMatchObject({
      caseId: 'case-1',
      caseTitle: 'Regression case',
      criteriaPassedCount: 1,
    });
    expect(JSON.stringify(writes[0].value)).not.toContain(evaluationCase.sourceText);
    expect(JSON.stringify(writes[0].value)).not.toContain(evaluationCase.answers[0].text);
    expect(writes[0].value).not.toHaveProperty('caseSnapshot');
    expect(writes[0].value).not.toHaveProperty('cells');
  });
});
