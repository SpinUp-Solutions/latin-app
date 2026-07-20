export type AnnotationKind =
  | 'subordinate-clause'
  | 'prepositional-phrase'
  | 'participial-phrase'
  | 'ablative-absolute'
  | 'passive-periphrastic'
  | 'verb'
  | 'infinitive'
  | 'participle'
  | 'active'
  | 'passive'
  | 'deponent'
  | 'person-1s'
  | 'person-2s'
  | 'person-3s'
  | 'person-1p'
  | 'person-2p'
  | 'person-3p'
  | 'special-plus-dative'
  | 'special-intransitive'
  | 'special-plus-ablative'
  | 'nominative'
  | 'predicate-nominative'
  | 'accusative'
  | 'predicate-accusative'
  | 'genitive'
  | 'dative'
  | 'ablative'
  | 'vocative'
  | 'locative'
  | 'particle';

export type AnnotationSelectionMode = 'token' | 'exact';

export type AnnotationExclusivityGroup = 'clause' | 'shape' | 'voice' | 'person' | 'special' | 'case';

export type AnnotationTone = 'default' | 'gold' | 'blue' | 'red' | 'orange' | 'green';

export type WrapperVisual = 'brackets' | 'parentheses' | 'box' | 'circle' | 'double-circle';

export interface AnnotationSpec {
  kind: AnnotationKind;
  label: string;
  shortLabel: string;
  groupTitle: string;
  selectionMode: AnnotationSelectionMode;
  exclusivityGroup?: AnnotationExclusivityGroup;
  tone: AnnotationTone;
  isWrapper: boolean;
  wrapperVisual?: WrapperVisual;
  wrapperPriority?: number;
  resettableColor: boolean;
}

export interface AnnotationToolGroup {
  title: string;
  tools: AnnotationKind[];
}

const SPEC_LIST: AnnotationSpec[] = [
  {
    kind: 'subordinate-clause',
    label: 'Subordinate Clause',
    shortLabel: 'Subord. Cl.',
    groupTitle: 'Clauses',
    selectionMode: 'token',
    exclusivityGroup: 'clause',
    tone: 'blue',
    isWrapper: true,
    wrapperVisual: 'brackets',
    wrapperPriority: 10,
    resettableColor: false,
  },
  {
    kind: 'prepositional-phrase',
    label: 'Prepositional Phrase',
    shortLabel: 'Prep. Phrase',
    groupTitle: 'Clauses',
    selectionMode: 'token',
    exclusivityGroup: 'clause',
    tone: 'orange',
    isWrapper: true,
    wrapperVisual: 'parentheses',
    wrapperPriority: 20,
    resettableColor: false,
  },
  {
    kind: 'participial-phrase',
    label: 'Participial Phrase',
    shortLabel: 'Participial Phrase',
    groupTitle: 'Clauses',
    selectionMode: 'token',
    exclusivityGroup: 'shape',
    tone: 'gold',
    isWrapper: true,
    wrapperVisual: 'box',
    wrapperPriority: 30,
    resettableColor: false,
  },
  {
    kind: 'ablative-absolute',
    label: 'Ablative Absolute',
    shortLabel: 'Abl. Absolute',
    groupTitle: 'Clauses',
    selectionMode: 'token',
    exclusivityGroup: 'shape',
    tone: 'gold',
    isWrapper: true,
    wrapperVisual: 'box',
    wrapperPriority: 40,
    resettableColor: false,
  },
  {
    kind: 'passive-periphrastic',
    label: 'Passive Periphrastic',
    shortLabel: 'Passive Periphrastic',
    groupTitle: 'Clauses',
    selectionMode: 'token',
    exclusivityGroup: 'shape',
    tone: 'red',
    isWrapper: true,
    wrapperVisual: 'circle',
    wrapperPriority: 50,
    resettableColor: false,
  },
  {
    kind: 'verb',
    label: 'Finite Verb',
    shortLabel: 'Finite Verb',
    groupTitle: 'Verbal Forms',
    selectionMode: 'token',
    exclusivityGroup: 'shape',
    tone: 'gold',
    isWrapper: true,
    wrapperVisual: 'circle',
    wrapperPriority: 60,
    resettableColor: false,
  },
  {
    kind: 'infinitive',
    label: 'Infinitive',
    shortLabel: 'Infinitive',
    groupTitle: 'Verbal Forms',
    selectionMode: 'token',
    exclusivityGroup: 'shape',
    tone: 'gold',
    isWrapper: true,
    wrapperVisual: 'double-circle',
    wrapperPriority: 70,
    resettableColor: false,
  },
  {
    kind: 'participle',
    label: 'Participle',
    shortLabel: 'Participle',
    groupTitle: 'Verbal Forms',
    selectionMode: 'token',
    exclusivityGroup: 'shape',
    tone: 'gold',
    isWrapper: true,
    wrapperVisual: 'box',
    wrapperPriority: 80,
    resettableColor: false,
  },
  {
    kind: 'active',
    label: 'Active',
    shortLabel: 'Active',
    groupTitle: 'Verbal Forms',
    selectionMode: 'token',
    exclusivityGroup: 'voice',
    tone: 'default',
    isWrapper: false,
    resettableColor: true,
  },
  {
    kind: 'passive',
    label: 'Passive',
    shortLabel: 'Passive',
    groupTitle: 'Verbal Forms',
    selectionMode: 'token',
    exclusivityGroup: 'voice',
    tone: 'blue',
    isWrapper: false,
    resettableColor: true,
  },
  {
    kind: 'deponent',
    label: 'Deponent',
    shortLabel: 'Deponent',
    groupTitle: 'Verbal Forms',
    selectionMode: 'token',
    tone: 'default',
    isWrapper: false,
    resettableColor: true,
  },
  {
    kind: 'person-1s',
    label: 'First Person Singular',
    shortLabel: '1s',
    groupTitle: 'Verbal Forms',
    selectionMode: 'exact',
    exclusivityGroup: 'person',
    tone: 'default',
    isWrapper: false,
    resettableColor: false,
  },
  {
    kind: 'person-2s',
    label: 'Second Person Singular',
    shortLabel: '2s',
    groupTitle: 'Verbal Forms',
    selectionMode: 'exact',
    exclusivityGroup: 'person',
    tone: 'default',
    isWrapper: false,
    resettableColor: false,
  },
  {
    kind: 'person-3s',
    label: 'Third Person Singular',
    shortLabel: '3s',
    groupTitle: 'Verbal Forms',
    selectionMode: 'exact',
    exclusivityGroup: 'person',
    tone: 'default',
    isWrapper: false,
    resettableColor: false,
  },
  {
    kind: 'person-1p',
    label: 'First Person Plural',
    shortLabel: '1p',
    groupTitle: 'Verbal Forms',
    selectionMode: 'exact',
    exclusivityGroup: 'person',
    tone: 'default',
    isWrapper: false,
    resettableColor: false,
  },
  {
    kind: 'person-2p',
    label: 'Second Person Plural',
    shortLabel: '2p',
    groupTitle: 'Verbal Forms',
    selectionMode: 'exact',
    exclusivityGroup: 'person',
    tone: 'default',
    isWrapper: false,
    resettableColor: false,
  },
  {
    kind: 'person-3p',
    label: 'Third Person Plural',
    shortLabel: '3p',
    groupTitle: 'Verbal Forms',
    selectionMode: 'exact',
    exclusivityGroup: 'person',
    tone: 'default',
    isWrapper: false,
    resettableColor: false,
  },
  {
    kind: 'special-plus-dative',
    label: 'Takes Dative',
    shortLabel: '+ Dat.',
    groupTitle: 'Verbal Forms',
    selectionMode: 'token',
    exclusivityGroup: 'special',
    tone: 'red',
    isWrapper: false,
    resettableColor: true,
  },
  {
    kind: 'special-intransitive',
    label: 'Intransitive',
    shortLabel: 'Intransitive',
    groupTitle: 'Verbal Forms',
    selectionMode: 'token',
    exclusivityGroup: 'special',
    tone: 'red',
    isWrapper: false,
    resettableColor: true,
  },
  {
    kind: 'special-plus-ablative',
    label: 'Takes Ablative',
    shortLabel: '+ Abl.',
    groupTitle: 'Verbal Forms',
    selectionMode: 'token',
    exclusivityGroup: 'special',
    tone: 'blue',
    isWrapper: false,
    resettableColor: true,
  },
  {
    kind: 'nominative',
    label: 'Nominative',
    shortLabel: 'Nominative',
    groupTitle: 'Cases',
    selectionMode: 'token',
    exclusivityGroup: 'case',
    tone: 'default',
    isWrapper: false,
    resettableColor: false,
  },
  {
    kind: 'predicate-nominative',
    label: 'Predicate Nominative',
    shortLabel: 'Pred. Nom.',
    groupTitle: 'Cases',
    selectionMode: 'token',
    exclusivityGroup: 'case',
    tone: 'default',
    isWrapper: false,
    resettableColor: false,
  },
  {
    kind: 'accusative',
    label: 'Accusative',
    shortLabel: 'Accusative',
    groupTitle: 'Cases',
    selectionMode: 'token',
    exclusivityGroup: 'case',
    tone: 'default',
    isWrapper: false,
    resettableColor: false,
  },
  {
    kind: 'predicate-accusative',
    label: 'Predicate Accusative',
    shortLabel: 'Pred. Acc.',
    groupTitle: 'Cases',
    selectionMode: 'token',
    exclusivityGroup: 'case',
    tone: 'default',
    isWrapper: false,
    resettableColor: false,
  },
  {
    kind: 'genitive',
    label: 'Genitive',
    shortLabel: 'Genitive',
    groupTitle: 'Cases',
    selectionMode: 'token',
    exclusivityGroup: 'case',
    tone: 'default',
    isWrapper: false,
    resettableColor: false,
  },
  {
    kind: 'dative',
    label: 'Dative',
    shortLabel: 'Dative',
    groupTitle: 'Cases',
    selectionMode: 'token',
    exclusivityGroup: 'case',
    tone: 'orange',
    isWrapper: false,
    resettableColor: true,
  },
  {
    kind: 'ablative',
    label: 'Ablative',
    shortLabel: 'Ablative',
    groupTitle: 'Cases',
    selectionMode: 'token',
    exclusivityGroup: 'case',
    tone: 'green',
    isWrapper: false,
    resettableColor: true,
  },
  {
    kind: 'vocative',
    label: 'Vocative',
    shortLabel: 'Vocative',
    groupTitle: 'Cases',
    selectionMode: 'token',
    exclusivityGroup: 'case',
    tone: 'default',
    isWrapper: false,
    resettableColor: false,
  },
  {
    kind: 'locative',
    label: 'Locative',
    shortLabel: 'Locative',
    groupTitle: 'Cases',
    selectionMode: 'token',
    exclusivityGroup: 'case',
    tone: 'default',
    isWrapper: false,
    resettableColor: false,
  },
  {
    kind: 'particle',
    label: 'Particle',
    shortLabel: 'Particle',
    groupTitle: 'Particle',
    selectionMode: 'exact',
    tone: 'default',
    isWrapper: false,
    resettableColor: false,
  },
];

export const ANNOTATION_SPECS = Object.fromEntries(SPEC_LIST.map(spec => [spec.kind, spec])) as Record<
  AnnotationKind,
  AnnotationSpec
>;

export const ANNOTATION_TOOL_GROUPS: AnnotationToolGroup[] = [
  {
    title: 'Clauses',
    tools: [
      'subordinate-clause',
      'prepositional-phrase',
      'participial-phrase',
      'ablative-absolute',
      'passive-periphrastic',
    ],
  },
  {
    title: 'Verbal Forms',
    tools: [
      'verb',
      'infinitive',
      'participle',
      'active',
      'passive',
      'deponent',
      'person-1s',
      'person-2s',
      'person-3s',
      'person-1p',
      'person-2p',
      'person-3p',
      'special-plus-dative',
      'special-intransitive',
      'special-plus-ablative',
    ],
  },
  {
    title: 'Cases',
    tools: [
      'nominative',
      'predicate-nominative',
      'accusative',
      'predicate-accusative',
      'genitive',
      'dative',
      'ablative',
      'vocative',
      'locative',
    ],
  },
  {
    title: 'Particle',
    tools: ['particle'],
  },
];

export const DEFAULT_STUDENT_TOOLS = ANNOTATION_TOOL_GROUPS.flatMap(group => group.tools);

export const COLOR_RESET_KINDS = SPEC_LIST.filter(spec => spec.resettableColor).map(spec => spec.kind);

export const WRAPPER_KINDS = SPEC_LIST.filter(spec => spec.isWrapper).map(spec => spec.kind);

export const normalizeAnnotationTools = (tools: AnnotationKind[] | undefined): AnnotationKind[] => {
  const seen = new Set<AnnotationKind>();

  return (tools || []).reduce<AnnotationKind[]>((normalized, tool) => {
    if (tool in ANNOTATION_SPECS && !seen.has(tool)) {
      seen.add(tool);
      normalized.push(tool);
    }

    return normalized;
  }, []);
};
