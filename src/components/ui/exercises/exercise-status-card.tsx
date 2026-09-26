import { Card, CardContent } from '@/src/components/ui/card';
import { RomanSpinner } from '@/src/components/ui/page-loading';
import { cn } from '@/src/lib/utils';

export function ExerciseLoadingCard({ label = 'Loading exercise...' }: { label?: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-center" role="status">
          <RomanSpinner className="mr-3" />
          <div className="text-gray-600">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ExerciseMessageCard({
  title,
  message,
  tone = 'error',
}: {
  title: string;
  message: string;
  tone?: 'error' | 'warning';
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className={cn('text-center', tone === 'error' ? 'text-red-600' : 'text-amber-600')}>
          <div className="font-medium">{title}</div>
          <div className="mt-2 text-sm">{message}</div>
        </div>
      </CardContent>
    </Card>
  );
}
