import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/src/components/ui/alert';
import { isUniformTable } from '@/src/utils/morphologyForms';

interface IndeclinableTableWarningProps {
  partOfSpeech: 'noun' | 'adjective';
  declension: string | null | undefined;
  table: unknown;
}

export function IndeclinableTableWarning({ partOfSpeech, declension, table }: IndeclinableTableWarningProps) {
  if (declension === 'indeclinable') return null;

  const tableToCheck =
    partOfSpeech === 'adjective' && table && typeof table === 'object' && 'positive' in table
      ? (table as Record<string, unknown>).positive
      : table;

  if (!isUniformTable(tableToCheck)) return null;

  return (
    <Alert role="status" className="border-amber-200 bg-amber-50 text-amber-900">
      <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
      <AlertTitle>This word may be indeclinable</AlertTitle>
      <AlertDescription>
        {partOfSpeech === 'adjective'
          ? 'Every filled form in the positive degree table has the same spelling. If this adjective does not decline in the positive degree, set Declension to Indeclinable.'
          : 'Every filled form in the declension table has the same spelling. If this noun does not decline, set Declension to Indeclinable.'}
      </AlertDescription>
    </Alert>
  );
}
