'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import { PassingRequirementControl } from './test-version/PassingRequirementControl';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import { useAssignMockMutation } from '@/src/store/api/mockTestApi';
import type { MockTest } from '@/src/types/test';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testId: string;
  versionId: string;
  defaultTitle: string;
  defaultDescription?: string;
  defaultPassingPercentage: number | null;
  onAssigned?: (mock: MockTest) => void;
};

const errorMessage = (error: unknown) => getApiErrorMessage(error, 'Could not assign this version as a mock test.');

/** Confirmation boundary for the ownership transfer from normal rotation to a mock card. */
export function MockAssignmentDialog({
  open,
  onOpenChange,
  testId,
  versionId,
  defaultTitle,
  defaultDescription = '',
  defaultPassingPercentage,
  onAssigned,
}: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [passingPercentage, setPassingPercentage] = useState<number | null>(defaultPassingPercentage);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assign, { isLoading }] = useAssignMockMutation();

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setDescription(defaultDescription);
      setPassingPercentage(defaultPassingPercentage);
      setIsLive(false);
      setError(null);
    }
  }, [defaultDescription, defaultPassingPercentage, defaultTitle, open]);

  const submit = async () => {
    setError(null);
    try {
      const response = await assign({
        testId,
        versionId,
        title: title.trim(),
        description: description.trim(),
        passingPercentage,
        isLive,
      }).unwrap();
      onOpenChange(false);
      onAssigned?.(response.mock);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Assign version as a mock card</DialogTitle>
          <DialogDescription>
            This transfers the version out of normal-test rotation. Students will receive it only through this one mock
            card.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mr-2 inline h-4 w-4" aria-hidden="true" />
          If this is the last rotation version of a test in the Learning Path, the assignment is refused. Add another
          version first or remove the test from the Learning Path.
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mock-title">Student-facing mock title</Label>
            <Input id="mock-title" value={title} onChange={event => setTitle(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mock-description">Description</Label>
            <Textarea
              id="mock-description"
              value={description}
              onChange={event => setDescription(event.target.value)}
            />
          </div>
          <PassingRequirementControl value={passingPercentage} onChange={setPassingPercentage} />
          <label className="flex items-start gap-2 text-sm">
            <input
              aria-label="Make mock live to students"
              type="checkbox"
              checked={isLive}
              onChange={event => setIsLive(event.target.checked)}
            />{' '}
            <span>Make this mock live to students now</span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={isLoading || !title.trim()}>
            {isLoading ? 'Assigning…' : 'Confirm mock assignment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
