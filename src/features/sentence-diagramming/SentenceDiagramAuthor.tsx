import React, { useMemo, useState } from 'react';
import {
  ANNOTATION_SPECS,
  ANNOTATION_TOOL_GROUPS,
  AnnotationKind,
  DEFAULT_STUDENT_TOOLS,
  normalizeAnnotationTools,
} from './annotation-spec';
import {
  applyDiagramAnnotation,
  DiagramAnnotation,
  normalizeSentenceDiagramFeedbackContent,
  resetDiagramColorAnnotations,
  SentenceDiagramDocument,
  tokenizeDiagramSentence,
} from './model';
import { DiagramSelection, getSelectionSpanForKind } from './selection';
import { SentenceDiagramSurface } from './SentenceDiagramSurface';
import { SentenceDiagramToolbar } from './SentenceDiagramToolbar';
import { Badge } from '@/src/components/ui/badge';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Button } from '@/src/components/ui/button';

interface SentenceDiagramAuthorProps {
  document: SentenceDiagramDocument;
  onChange: (document: SentenceDiagramDocument) => void;
}

const difficultyOptions = ['beginner', 'intermediate', 'advanced'] as const;

interface DiagramAnnotationEditorProps {
  title: string;
  description: string;
  tokens: SentenceDiagramDocument['tokens'];
  annotations: DiagramAnnotation[];
  onChange: (annotations: DiagramAnnotation[]) => void;
  emptyState: string;
  text?: string;
  onTextChange?: (value: string) => void;
  textLabel?: string;
  textPlaceholder?: string;
}

const DiagramAnnotationEditor: React.FC<DiagramAnnotationEditorProps> = ({
  title,
  description,
  tokens,
  annotations,
  onChange,
  emptyState,
  text,
  onTextChange,
  textLabel,
  textPlaceholder,
}) => {
  const [selection, setSelection] = useState<DiagramSelection | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const groupedAnnotations = useMemo(
    () =>
      annotations.reduce<Record<string, DiagramAnnotation[]>>((groups, annotation) => {
        const groupTitle = ANNOTATION_SPECS[annotation.kind].groupTitle;
        groups[groupTitle] = groups[groupTitle] || [];
        groups[groupTitle].push(annotation);
        return groups;
      }, {}),
    [annotations]
  );

  const applyTool = (kind: AnnotationKind) => {
    const span = getSelectionSpanForKind(selection, kind, tokens);

    if (!span) {
      setMessage(
        kind.startsWith('person-')
          ? 'Select exact ending letters inside one token before using a person tool.'
          : 'Select one or more tokens before applying a diagramming tool.'
      );
      return;
    }

    const result = applyDiagramAnnotation({
      annotations,
      kind,
      span,
      tokens,
    });

    onChange(result.annotations);
    setMessage(result.error || null);
  };

  return (
    <div className="space-y-4 rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-stone-500">{title}</div>
          <div className="text-sm text-stone-600">{description}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-stone-300 bg-white px-3 py-1 text-stone-700">
            {annotations.length} annotations
          </Badge>
          <Badge variant="outline" className="border-stone-300 bg-white px-3 py-1 text-stone-700">
            {tokens.length} tokens
          </Badge>
        </div>
      </div>

      {onTextChange ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-stone-800">{textLabel || 'Text'}</label>
          <Textarea
            value={text || ''}
            onChange={event => onTextChange(event.target.value)}
            className="min-h-[110px] resize-y"
            placeholder={textPlaceholder}
          />
        </div>
      ) : null}

      <SentenceDiagramToolbar
        disabled={false}
        onToolClick={applyTool}
        onResetColors={() => {
          onChange(resetDiagramColorAnnotations(annotations, tokens));
          setMessage(null);
        }}
        onClear={() => {
          onChange([]);
          setMessage(null);
        }}
      />

      <SentenceDiagramSurface
        tokens={tokens}
        annotations={annotations}
        selection={selection}
        onSelectionChange={nextSelection => {
          setSelection(nextSelection);
          setMessage(null);
        }}
        message={message}
      />

      <div className="rounded-[1.5rem] border border-stone-200 bg-white/80 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Authored Annotations</div>
            <div className="text-sm text-stone-600">Each item below is persisted as a canonical JSON annotation.</div>
          </div>
          {annotations.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => onChange([])}>
              Clear
            </Button>
          ) : null}
        </div>

        {annotations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-sm text-stone-500">
            {emptyState}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedAnnotations).map(([groupTitle, groupedItems]) => (
              <div key={groupTitle} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">{groupTitle}</div>
                <div className="flex flex-wrap gap-2">
                  {groupedItems.map(annotation => (
                    <button
                      key={annotation.id}
                      type="button"
                      onClick={() =>
                        onChange(annotations.filter(currentAnnotation => currentAnnotation.id !== annotation.id))
                      }
                      className="rounded-full border border-stone-300 bg-stone-50 px-3 py-2 text-left text-xs text-stone-700 transition hover:bg-stone-100">
                      <span className="font-semibold text-stone-900">
                        {ANNOTATION_SPECS[annotation.kind].shortLabel}
                      </span>
                      <span className="mx-2 text-stone-400">•</span>
                      <span>
                        {annotation.span.startTokenIndex}:{annotation.span.startCharOffset}-
                        {annotation.span.endTokenIndex}:{annotation.span.endCharOffset}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const SentenceDiagramAuthor: React.FC<SentenceDiagramAuthorProps> = ({ document, onChange }) => {
  const normalizedTools = normalizeAnnotationTools(document.availableStudentTools);
  const availableStudentTools = normalizedTools.length ? normalizedTools : DEFAULT_STUDENT_TOOLS;
  const hintContent = normalizeSentenceDiagramFeedbackContent(document.hint);
  const explanationContent = normalizeSentenceDiagramFeedbackContent(document.explanation);

  const updateDocument = (updates: Partial<SentenceDiagramDocument>) => {
    onChange({
      ...document,
      ...updates,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5 rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-sm">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-stone-500">
              Sentence Authoring
            </div>
            <div className="text-sm text-stone-600">
              This sentence is immutable in the solution surface below. Editing it retokenizes and clears the solution
              annotations.
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-stone-800">Latin Sentence</label>
            <Textarea
              value={document.latin}
              onChange={event => {
                const latin = event.target.value;
                updateDocument({
                  latin,
                  tokens: tokenizeDiagramSentence(latin),
                  solutionAnnotations: [],
                });
              }}
              placeholder="Enter the Latin sentence"
              className="min-h-[60px] resize-y"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-stone-800">English Translation</label>
            <Input
              value={document.translation}
              onChange={event => updateDocument({ translation: event.target.value })}
              placeholder="Enter the translation"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-stone-800">Difficulty</label>
              <Select
                value={document.difficulty}
                onValueChange={value => updateDocument({ difficulty: value as SentenceDiagramDocument['difficulty'] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {difficultyOptions.map(option => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-stone-800">Token Count</label>
              <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm text-stone-600">
                {document.tokens.length} tokens
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5 rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-sm">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-stone-500">Student Toolbar</div>
            <div className="text-sm text-stone-600">
              Choose which tools students can access. The solution authoring surface keeps the full catalog.
            </div>
          </div>

          <div className="space-y-4">
            {ANNOTATION_TOOL_GROUPS.map(group => (
              <div key={group.title} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">{group.title}</div>
                <div className="flex flex-wrap gap-2">
                  {group.tools.map(tool => {
                    const enabled = availableStudentTools.includes(tool);
                    return (
                      <button
                        key={tool}
                        type="button"
                        onClick={() => {
                          const nextTools = enabled
                            ? availableStudentTools.filter(currentTool => currentTool !== tool)
                            : [...availableStudentTools, tool];

                          updateDocument({
                            availableStudentTools: nextTools,
                          });
                        }}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                          enabled
                            ? 'border-stone-900 bg-stone-900 text-white'
                            : 'border-stone-300 bg-stone-50 text-stone-700 hover:bg-stone-100'
                        }`}>
                        {ANNOTATION_SPECS[tool].shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <DiagramAnnotationEditor
        title="Solution Authoring"
        description="Select immutable tokens, apply annotations, and save structured JSON only."
        tokens={document.tokens}
        annotations={document.solutionAnnotations}
        onChange={solutionAnnotations => updateDocument({ solutionAnnotations })}
        emptyState="No solution annotations yet."
      />

      <DiagramAnnotationEditor
        title="Hint Diagram"
        description="Annotate the custom hint text shown when a feedback level enables hint display."
        tokens={hintContent.tokens}
        annotations={hintContent.annotations}
        text={hintContent.text}
        textLabel="Hint Text"
        textPlaceholder="Write the hint text here. Editing it retokenizes and clears the hint annotations."
        onTextChange={value =>
          updateDocument({
            hint: {
              text: value,
              tokens: tokenizeDiagramSentence(value),
              annotations: [],
            },
          })
        }
        onChange={annotations =>
          updateDocument({
            hint: {
              ...hintContent,
              annotations,
            },
          })
        }
        emptyState="No hint annotations yet."
      />

      <DiagramAnnotationEditor
        title="Explanation Diagram"
        description="Annotate the custom explanation text shown after correct answers when explanations are enabled."
        tokens={explanationContent.tokens}
        annotations={explanationContent.annotations}
        text={explanationContent.text}
        textLabel="Explanation Text"
        textPlaceholder="Write the explanation text here. Editing it retokenizes and clears the explanation annotations."
        onTextChange={value =>
          updateDocument({
            explanation: {
              text: value,
              tokens: tokenizeDiagramSentence(value),
              annotations: [],
            },
          })
        }
        onChange={annotations =>
          updateDocument({
            explanation: {
              ...explanationContent,
              annotations,
            },
          })
        }
        emptyState="No explanation annotations yet."
      />
    </div>
  );
};

export default SentenceDiagramAuthor;
