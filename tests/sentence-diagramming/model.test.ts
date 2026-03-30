import {
  compareDiagramAnnotationSets,
  createAnnotationId,
  DiagramAnnotation,
  DiagramSpan,
  tokenizeDiagramSentence,
} from '@/src/features/sentence-diagramming/model';

const createAnnotation = (kind: DiagramAnnotation['kind'], span: DiagramSpan): DiagramAnnotation => ({
  id: createAnnotationId(kind, span),
  kind,
  span,
});

describe('compareDiagramAnnotationSets', () => {
  it('treats adjacent token annotations of the same kind as equivalent to one combined span', () => {
    const tokens = tokenizeDiagramSentence('puella bona currit celeriter');
    const solution = [
      createAnnotation('nominative', {
        startTokenIndex: 0,
        endTokenIndex: 0,
        startCharOffset: 0,
        endCharOffset: tokens[0].text.length,
      }),
      createAnnotation('nominative', {
        startTokenIndex: 1,
        endTokenIndex: 1,
        startCharOffset: 0,
        endCharOffset: tokens[1].text.length,
      }),
    ];
    const student = [
      createAnnotation('nominative', {
        startTokenIndex: 0,
        endTokenIndex: 1,
        startCharOffset: 0,
        endCharOffset: tokens[1].text.length,
      }),
    ];

    expect(compareDiagramAnnotationSets(student, solution, tokens)).toMatchObject({
      matched: 1,
      expected: 1,
      extra: 0,
      isComplete: true,
    });
  });

  it('treats split exact selections as equivalent when they cover the same letters', () => {
    const tokens = tokenizeDiagramSentence('amamus');
    const solution = [
      createAnnotation('person-1p', {
        startTokenIndex: 0,
        endTokenIndex: 0,
        startCharOffset: 3,
        endCharOffset: 6,
      }),
    ];
    const student = [
      createAnnotation('person-1p', {
        startTokenIndex: 0,
        endTokenIndex: 0,
        startCharOffset: 3,
        endCharOffset: 4,
      }),
      createAnnotation('person-1p', {
        startTokenIndex: 0,
        endTokenIndex: 0,
        startCharOffset: 4,
        endCharOffset: 6,
      }),
    ];

    expect(compareDiagramAnnotationSets(student, solution, tokens)).toMatchObject({
      matched: 1,
      expected: 1,
      extra: 0,
      isComplete: true,
    });
  });

  it('keeps wrapper spans strict even when adjacent wrappers could be merged conceptually', () => {
    const tokens = tokenizeDiagramSentence('cum amico in foro ambulat');
    const solution = [
      createAnnotation('prepositional-phrase', {
        startTokenIndex: 0,
        endTokenIndex: 1,
        startCharOffset: 0,
        endCharOffset: tokens[1].text.length,
      }),
      createAnnotation('prepositional-phrase', {
        startTokenIndex: 2,
        endTokenIndex: 3,
        startCharOffset: 0,
        endCharOffset: tokens[3].text.length,
      }),
    ];
    const student = [
      createAnnotation('prepositional-phrase', {
        startTokenIndex: 0,
        endTokenIndex: 3,
        startCharOffset: 0,
        endCharOffset: tokens[3].text.length,
      }),
    ];

    expect(compareDiagramAnnotationSets(student, solution, tokens)).toMatchObject({
      matched: 0,
      expected: 2,
      extra: 1,
      isComplete: false,
    });
  });
});
