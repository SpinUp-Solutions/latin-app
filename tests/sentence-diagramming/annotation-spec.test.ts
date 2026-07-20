import {
  ANNOTATION_SPECS,
  ANNOTATION_TOOL_GROUPS,
  DEFAULT_STUDENT_TOOLS,
} from '@/src/features/sentence-diagramming/annotation-spec';
import { createEmptySentenceDiagramDocument } from '@/src/features/sentence-diagramming/model';

describe('sentence diagram annotation catalog', () => {
  it('uses the author-facing Finite Verb and Particle labels', () => {
    expect(ANNOTATION_SPECS.verb).toMatchObject({ label: 'Finite Verb', shortLabel: 'Finite Verb' });
    expect(ANNOTATION_SPECS.particle).toMatchObject({
      label: 'Particle',
      shortLabel: 'Particle',
      selectionMode: 'exact',
    });
    expect(ANNOTATION_TOOL_GROUPS.at(-1)).toEqual({ title: 'Particle', tools: ['particle'] });
  });

  it('orders Deponent after Active and Passive and includes it in new defaults', () => {
    const verbalTools = ANNOTATION_TOOL_GROUPS.find(group => group.title === 'Verbal Forms')?.tools ?? [];

    expect(verbalTools.slice(verbalTools.indexOf('active'), verbalTools.indexOf('active') + 3)).toEqual([
      'active',
      'passive',
      'deponent',
    ]);
    expect(DEFAULT_STUDENT_TOOLS).toContain('deponent');
    expect(createEmptySentenceDiagramDocument('loquitur', '').availableStudentTools).toContain('deponent');
  });

  it('preserves explicitly saved restricted student tool lists', () => {
    expect(
      createEmptySentenceDiagramDocument('loquitur', '', {
        availableStudentTools: ['verb', 'active', 'passive'],
      }).availableStudentTools
    ).toEqual(['verb', 'active', 'passive']);
  });
});
