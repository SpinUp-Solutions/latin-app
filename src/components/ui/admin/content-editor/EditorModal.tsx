import React from 'react';
import { Button } from '@/src/components/ui/button';
import { X } from 'lucide-react';

interface EditorModalProps {
  title: string;
  onClose: () => void;
  onSave: () => void;
  children: React.ReactNode;
}

export const EditorModal: React.FC<EditorModalProps> = ({ title, onClose, onSave, children }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">{title}</h2>
          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4">{children}</div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
};
