import { cn } from '@/src/lib/utils';

export function aiFieldHighlightClass(status: 'filled' | 'missing' | null | undefined) {
  return cn(
    status === 'filled' && 'bg-green-50 border-green-300 transition-colors',
    status === 'missing' && 'bg-red-50 border-red-300 transition-colors',
    'focus:bg-white'
  );
}
