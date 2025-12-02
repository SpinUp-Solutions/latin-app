import { useContext } from 'react';
import { AIFilledFieldsContext } from '@/src/components/ui/admin/vocabulary/WordEditPanel';

export function useAIFieldStatus(fieldName: string): 'filled' | 'missing' | null {
  const aiFieldStatus = useContext(AIFilledFieldsContext);
  return aiFieldStatus.get(fieldName) ?? null;
}
