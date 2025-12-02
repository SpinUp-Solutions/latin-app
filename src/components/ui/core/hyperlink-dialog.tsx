import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Checkbox } from '@/src/components/ui/checkbox';

interface HyperlinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (href: string, openInNewTab: boolean) => void;
  onRemove?: () => void;
  initialHref?: string;
  selectedText?: string;
}

export const HyperlinkDialog: React.FC<HyperlinkDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  onRemove,
  initialHref = '',
  selectedText = '',
}) => {
  const [href, setHref] = useState(initialHref);
  const [openInNewTab, setOpenInNewTab] = useState(false);

  useEffect(() => {
    setHref(initialHref);
    setOpenInNewTab(false);
  }, [initialHref, isOpen]);

  const handleSave = () => {
    if (href.trim()) {
      onSave(href.trim(), openInNewTab);
      onClose();
    }
  };

  const handleClose = () => {
    setHref('');
    setOpenInNewTab(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initialHref ? 'Edit Link' : 'Add Link'}</DialogTitle>
          <DialogDescription>
            {selectedText ? `Add a link to "${selectedText}"` : 'Enter the URL for this link'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="href">URL</Label>
            <Input
              id="href"
              value={href}
              onChange={e => setHref(e.target.value)}
              placeholder="https://example.com or /path/to/page"
              className="mt-1"
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="newTab"
              checked={openInNewTab}
              onCheckedChange={checked => setOpenInNewTab(checked === true)}
            />
            <Label htmlFor="newTab" className="text-sm font-normal cursor-pointer">
              Open in new tab
            </Label>
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t">
          <div>
            {initialHref && onRemove && (
              <Button variant="destructive" onClick={onRemove}>
                Remove Link
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!href.trim()}>
              {initialHref ? 'Update Link' : 'Add Link'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
