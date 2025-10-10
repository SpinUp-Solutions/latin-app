import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/src/components/ui/alert-dialog';

interface DeleteWordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wordName: string;
  onConfirm: () => void;
  isDeleting: boolean;
}

export const DeleteWordDialog: React.FC<DeleteWordDialogProps> = ({
  open,
  onOpenChange,
  wordName,
  onConfirm,
  isDeleting,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-white">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Word Entry</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong className="text-roman-red">{wordName}</strong>? This action cannot
            be undone and will permanently remove this word from the vocabulary database.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={e => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600">
            {isDeleting ? 'Deleting...' : 'Delete Word'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
