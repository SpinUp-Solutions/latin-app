import { BookOpen } from 'lucide-react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { RomanSpinner } from '@/src/components/ui/page-loading';
import { SimpleRichDisplay } from '../core/simple-rich-display';

export function VocabularyNotice({
  title,
  subtitle,
  message,
  detail,
  status = 'empty',
}: {
  title?: string;
  subtitle?: string;
  message: string;
  detail?: string;
  status?: 'empty' | 'loading' | 'error';
}) {
  return (
    <div className="space-y-6">
      {title ? (
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-serif text-gray-800">
            <SimpleRichDisplay content={title} />
          </h2>
          {subtitle ? <p className="text-roman-stone">{subtitle}</p> : null}
        </div>
      ) : null}
      <RomanCard>
        <RomanCardContent className="p-8 text-center">
          {status === 'loading' ? (
            <RomanSpinner className="mx-auto mb-4" />
          ) : (
            <BookOpen className={`h-12 w-12 mx-auto mb-4 ${status === 'error' ? 'text-red-300' : 'text-gray-300'}`} />
          )}
          <p className={status === 'error' ? 'text-red-600 font-medium' : 'text-gray-500'}>{message}</p>
          {detail ? <p className="text-roman-stone text-sm mt-2">{detail}</p> : null}
        </RomanCardContent>
      </RomanCard>
    </div>
  );
}
