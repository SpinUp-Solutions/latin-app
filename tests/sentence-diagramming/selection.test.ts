import {
  getActiveAnnotationKindsForSelection,
  getAnnotationsForSelection,
  type DiagramSelection,
} from '@/src/features/sentence-diagramming/selection';
import {
  createAnnotationId,
  type DiagramAnnotation,
  type DiagramSpan,
  tokenizeDiagramSentence,
} from '@/src/features/sentence-diagramming/model';

const createAnnotation = (kind: DiagramAnnotation['kind'], span: DiagramSpan): DiagramAnnotation => ({
  id: createAnnotationId(kind, span),
  kind,
  span,
});

describe('sentence diagram selection inspection', () => {
  const tokens = tokenizeDiagramSentence('vēnerimus agēmus');
  const firstWord = {
    startTokenIndex: 0,
    endTokenIndex: 0,
    startCharOffset: 0,
    endCharOffset: tokens[0].text.length,
  };
  const firstEnding = {
    startTokenIndex: 0,
    endTokenIndex: 0,
    startCharOffset: 6,
    endCharOffset: 9,
  };
  const secondEnding = {
    startTokenIndex: 1,
    endTokenIndex: 1,
    startCharOffset: 3,
    endCharOffset: 6,
  };
  const annotations = [
    createAnnotation('verb', firstWord),
    createAnnotation('active', firstWord),
    createAnnotation('person-1p', firstEnding),
    createAnnotation('person-3s', secondEnding),
  ];
  const tools: DiagramAnnotation['kind'][] = ['verb', 'active', 'person-1p', 'person-3s'];

  it('highlights only annotations whose effective span matches the selected ending', () => {
    const selection: DiagramSelection = { span: firstEnding, text: 'mus' };

    expect([...getActiveAnnotationKindsForSelection(selection, annotations, tools, tokens)]).toEqual([
      'verb',
      'active',
      'person-1p',
    ]);
    expect(getAnnotationsForSelection(selection, annotations, tokens).map(annotation => annotation.kind)).toEqual([
      'verb',
      'active',
      'person-1p',
    ]);
  });

  it('does not highlight a person annotation attached to a different ending', () => {
    const selection: DiagramSelection = { span: firstEnding, text: 'mus' };
    const activeKinds = getActiveAnnotationKindsForSelection(selection, annotations, tools, tokens);

    expect(activeKinds.has('person-1p')).toBe(true);
    expect(activeKinds.has('person-3s')).toBe(false);
  });

  it('shows whole-word annotations but not an ending annotation when the whole word is selected', () => {
    const selection: DiagramSelection = { span: firstWord, text: 'vēnerimus' };

    expect([...getActiveAnnotationKindsForSelection(selection, annotations, tools, tokens)]).toEqual([
      'verb',
      'active',
    ]);
  });
});
