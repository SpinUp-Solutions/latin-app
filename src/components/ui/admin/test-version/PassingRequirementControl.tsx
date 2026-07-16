'use client';

import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';

interface PassingRequirementControlProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

export function PassingRequirementControl({ value, onChange }: PassingRequirementControlProps) {
  const requiresPass = value !== null;

  return (
    <div className="space-y-3">
      <Label>Passing requirement</Label>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={!requiresPass} onChange={() => onChange(null)} />
          Score only
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={requiresPass} onChange={() => onChange(value ?? 70)} />
          Require a passing score
        </label>
        {requiresPass && (
          <div className="flex items-center gap-2">
            <Input
              aria-label="Passing percentage"
              type="number"
              min={1}
              max={100}
              step={1}
              className="h-8 w-20"
              value={value}
              onChange={event => onChange(Math.min(100, Math.max(1, Math.floor(Number(event.target.value) || 1))))}
            />
            <span>%</span>
          </div>
        )}
      </div>
    </div>
  );
}
