import {
  applyDiagramAnnotation,
  compareDiagramAnnotationSets,
  createAnnotationId,
  DiagramAnnotation,
  DiagramSpan,
  tokenizeDiagramSentence,
} from '@/src/features/sentence-diagramming/model';
import { buildTokenRenderState } from '@/src/features/sentence-diagramming/rendering';

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

  it('persists and compares exact partial-word Particle spans', () => {
    const tokens = tokenizeDiagramSentence('neque');
    const partialSpan = {
      startTokenIndex: 0,
      endTokenIndex: 0,
      startCharOffset: 1,
      endCharOffset: 4,
    };
    const applied = applyDiagramAnnotation({ annotations: [], kind: 'particle', span: partialSpan, tokens });
    const student = [
      createAnnotation('particle', { ...partialSpan, endCharOffset: 2 }),
      createAnnotation('particle', { ...partialSpan, startCharOffset: 2 }),
    ];

    expect(applied.annotations).toEqual([createAnnotation('particle', partialSpan)]);
    expect(compareDiagramAnnotationSets(student, applied.annotations, tokens)).toMatchObject({
      matched: 1,
      expected: 1,
      extra: 0,
      isComplete: true,
    });
    expect(buildTokenRenderState(tokens[0], applied.annotations).segments).toEqual([
      expect.objectContaining({ text: 'n', italicExact: false }),
      expect.objectContaining({ text: 'equ', italicExact: true }),
      expect.objectContaining({ text: 'e', italicExact: false }),
    ]);
  });

  it('keeps legacy whole-word Particle spans compatible', () => {
    const tokens = tokenizeDiagramSentence('aut');
    const wholeWord = {
      startTokenIndex: 0,
      endTokenIndex: 0,
      startCharOffset: 0,
      endCharOffset: tokens[0].text.length,
    };
    const annotation = createAnnotation('particle', wholeWord);

    expect(applyDiagramAnnotation({ annotations: [], kind: 'particle', span: wholeWord, tokens }).annotations).toEqual([
      annotation,
    ]);
    expect(buildTokenRenderState(tokens[0], [annotation]).segments).toEqual([
      expect.objectContaining({ text: 'aut', italicExact: true }),
    ]);
  });

  it('lets Deponent coexist with Active or Passive and renders it bold', () => {
    const tokens = tokenizeDiagramSentence('loquitur');
    const wholeWord = {
      startTokenIndex: 0,
      endTokenIndex: 0,
      startCharOffset: 0,
      endCharOffset: tokens[0].text.length,
    };
    const active = applyDiagramAnnotation({ annotations: [], kind: 'active', span: wholeWord, tokens }).annotations;
    const activeDeponent = applyDiagramAnnotation({
      annotations: active,
      kind: 'deponent',
      span: wholeWord,
      tokens,
    }).annotations;
    const passiveDeponent = applyDiagramAnnotation({
      annotations: activeDeponent,
      kind: 'passive',
      span: wholeWord,
      tokens,
    }).annotations;

    expect(activeDeponent.map(annotation => annotation.kind)).toEqual(['active', 'deponent']);
    expect(passiveDeponent.map(annotation => annotation.kind)).toEqual(['deponent', 'passive']);
    expect(buildTokenRenderState(tokens[0], [createAnnotation('deponent', wholeWord)]).className).toContain(
      'font-bold'
    );
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

  it('penalizes extra annotations even when every expected annotation is present', () => {
    const tokens = tokenizeDiagramSentence('amat');
    const wholeWord = {
      startTokenIndex: 0,
      endTokenIndex: 0,
      startCharOffset: 0,
      endCharOffset: tokens[0].text.length,
    };
    const solution = [createAnnotation('verb', wholeWord)];
    const student = [...solution, createAnnotation('active', wholeWord)];

    expect(compareDiagramAnnotationSets(student, solution, tokens)).toMatchObject({
      matched: 1,
      expected: 1,
      extra: 1,
      accuracy: 50,
      isComplete: false,
    });
  });
});
