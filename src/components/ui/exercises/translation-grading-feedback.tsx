import { Check, Lightbulb } from 'lucide-react';
import type { TranslationGradingOutput } from '@/shared/openai/translation-grading';
import {
  RomanTable,
  RomanTableHeader,
  RomanTableBody,
  RomanTableRow,
  RomanTableHead,
  RomanTableCell,
} from '../core/roman-table';

const getRoleColor = (role: string) => {
  const r = role.toLowerCase();
  if (r.includes('protasis') || r.includes('condition')) return 'border-blue-400 bg-blue-50 text-blue-700';
  if (r.includes('apodosis') || r.includes('conclusion')) return 'border-purple-400 bg-purple-50 text-purple-700';
  if (r.includes('subject')) return 'border-green-400 bg-green-50 text-green-700';
  if (r.includes('subordinate') || r.includes('relative')) return 'border-indigo-400 bg-indigo-50 text-indigo-700';
  if (r.includes('participial')) return 'border-orange-400 bg-orange-50 text-orange-700';
  if (r.includes('object')) return 'border-yellow-400 bg-yellow-50 text-yellow-700';
  return 'border-gray-300 bg-gray-50 text-gray-700';
};

interface TranslationGradingFeedbackProps {
  data: Pick<
    TranslationGradingOutput,
    'feedbackLevel' | 'notes' | 'suggestedText' | 'breakdown' | 'grammaticalBreakdown'
  >;
  sourceLanguage: string;
  targetLanguage: string;
}

/** The lesson grading feedback students see; the admin AI evaluation page renders the same view. */
export function TranslationGradingFeedback({ data, sourceLanguage, targetLanguage }: TranslationGradingFeedbackProps) {
  return (
    <>
      {/* Qualitative level & overall feedback */}
      <div className="p-5 bg-roman-parchment/20 rounded-xl border border-roman-red/10 space-y-4 shadow-sm">
        <div className="flex items-center gap-4 border-b border-roman-red/10 pb-4">
          <div className="flex flex-col items-center justify-center p-3 bg-white rounded-lg border border-roman-red/20 shadow-sm min-w-[80px]">
            <span className="text-xl text-center font-serif font-bold text-roman-red leading-tight">
              {data.feedbackLevel}
            </span>
            <span className="text-[9px] uppercase tracking-widest text-roman-red font-bold mt-1">Feedback</span>
          </div>
          <div className="flex-1">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-roman-red/80 mb-1.5 flex items-center gap-2">
              <span className="w-2 h-px bg-roman-red/30" />
              Overall Feedback
            </h4>
            <p className="text-sm text-gray-700 leading-relaxed italic">&ldquo;{data.notes}&rdquo;</p>
          </div>
        </div>

        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-roman-red/80 mb-2 flex items-center gap-2">
            <span className="w-2 h-px bg-roman-red/30" />
            Suggested Translation
          </h4>
          <div className="p-3 bg-white/50 rounded-lg border border-roman-red/10">
            <p className="text-md font-serif italic text-gray-800 leading-relaxed">{data.suggestedText}</p>
          </div>
        </div>
      </div>

      {/* Tables Container */}
      <div className="grid grid-cols-1 gap-8">
        {/* Detailed Breakdown Table */}
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-roman-red/80 mb-3 flex items-center gap-2">
            <span className="w-4 h-px bg-roman-red/20" />
            Detailed Segment Breakdown
          </h4>
          <RomanTable>
            <RomanTableHeader>
              <RomanTableRow className="border-roman-red/10">
                <RomanTableHead className="w-1/3 py-2 text-[10px] text-roman-red/80 font-bold uppercase tracking-widest">
                  {sourceLanguage} Segment
                </RomanTableHead>
                <RomanTableHead className="w-1/3 py-2 text-[10px] text-roman-red/80 font-bold uppercase tracking-widest">
                  Your {targetLanguage}
                </RomanTableHead>
                <RomanTableHead className="py-2 text-[10px] text-roman-red/80 font-bold uppercase tracking-widest">
                  Feedback
                </RomanTableHead>
              </RomanTableRow>
            </RomanTableHeader>
            <RomanTableBody>
              {data.breakdown.map((row, i) => (
                <RomanTableRow key={i} className="border-roman-red/5">
                  <RomanTableCell className="py-2.5 italic text-gray-900 font-serif leading-relaxed">
                    {row.latinSegment}
                  </RomanTableCell>
                  <RomanTableCell className="py-2.5 text-gray-600 font-sans text-xs">
                    {row.yourTranslation}
                  </RomanTableCell>
                  <RomanTableCell className="py-2.5">
                    <div className="flex items-start gap-2 font-sans text-xs">
                      <span className="shrink-0 mt-0.5">
                        {row.type === '✓' ? (
                          <Check className="h-3.5 w-3.5 text-green-600 stroke-[3]" />
                        ) : (
                          <Lightbulb className="h-3.5 w-3.5 text-roman-red stroke-[2.5]" />
                        )}
                      </span>
                      <span className="text-gray-700 leading-relaxed">{row.feedback}</span>
                    </div>
                  </RomanTableCell>
                </RomanTableRow>
              ))}
            </RomanTableBody>
          </RomanTable>
        </div>

        {/* Grammatical Analysis Table */}
        {data.grammaticalBreakdown && data.grammaticalBreakdown.length > 0 && (
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-roman-red/80 mb-3 flex items-center gap-2">
              <span className="w-4 h-px bg-roman-red/20" />
              Grammatical & Syntactic Analysis
            </h4>
            <RomanTable>
              <RomanTableHeader>
                <RomanTableRow className="border-roman-red/10">
                  <RomanTableHead className="w-1/3 py-2 text-[10px] text-roman-red/80 font-bold uppercase tracking-widest">
                    Latin Segment
                  </RomanTableHead>
                  <RomanTableHead className="w-1/6 py-2 text-[10px] text-roman-red/80 font-bold uppercase tracking-widest">
                    Syntactic Role
                  </RomanTableHead>
                  <RomanTableHead className="py-2 text-[10px] text-roman-red/80 font-bold uppercase tracking-widest">
                    Grammatical Analysis
                  </RomanTableHead>
                </RomanTableRow>
              </RomanTableHeader>
              <RomanTableBody>
                {data.grammaticalBreakdown.map((item, i) => (
                  <RomanTableRow key={i} className="border-roman-red/5">
                    <RomanTableCell className="py-2.5 italic text-gray-900 font-serif leading-relaxed">
                      {item.latinSegment}
                    </RomanTableCell>
                    <RomanTableCell className="py-2.5">
                      <div
                        className={`inline-flex px-1.5 py-0.5 border-l-2 text-[9px] uppercase tracking-wider font-bold font-sans ${getRoleColor(
                          item.syntacticalRole
                        )}`}>
                        {item.syntacticalRole}
                      </div>
                    </RomanTableCell>
                    <RomanTableCell className="py-2.5 font-sans text-xs">
                      <div className="space-y-1">
                        <p className="text-gray-700 leading-relaxed">{item.keyGrammaticalFeatures}</p>
                        {item.notes && (
                          <p className="text-[10px] text-roman-red/60 italic leading-snug">Note: {item.notes}</p>
                        )}
                      </div>
                    </RomanTableCell>
                  </RomanTableRow>
                ))}
              </RomanTableBody>
            </RomanTable>
          </div>
        )}
      </div>
    </>
  );
}
