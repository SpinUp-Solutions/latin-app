import { Fragment, type ReactNode } from 'react';
import { WORD_FIELD_ROWS, type WordFieldName } from '@/src/components/ui/admin/vocabulary/wordFields';
import { AIFieldReview } from '@/src/components/ui/admin/vocabulary/VocabularyAIReview';

/** Shared field order and grouping, with controls supplied by the editor or review. */
export function WordFieldLayout({
  section,
  renderField,
  visible = () => true,
}: {
  section: string;
  renderField: (name: WordFieldName) => ReactNode;
  visible?: (name: WordFieldName) => boolean;
}) {
  return (
    <div className="space-y-6">
      {(WORD_FIELD_ROWS[section] ?? []).map((row, index) => {
        const fields = row.filter(visible);
        const hidden = row.filter(name => !visible(name));
        return (
          <Fragment key={index}>
            {fields.length > 0 && (
              <div className={row.length > 1 ? 'grid grid-cols-2 gap-4' : undefined}>
                {fields.map(name => (
                  <AIFieldReview key={name} field={name}>
                    {renderField(name)}
                  </AIFieldReview>
                ))}
              </div>
            )}
            {hidden.map(name => (
              <AIFieldReview key={name} field={name} fieldHidden />
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}
