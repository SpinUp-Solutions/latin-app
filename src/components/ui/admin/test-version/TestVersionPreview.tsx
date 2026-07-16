'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileCheck2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import PageTemplate from '@/src/components/ui/lesson/page-template';
import type { Page } from '@/src/types/page';

export function TestVersionPreview({ pages }: { pages: Page[] }) {
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(current => Math.min(current, Math.max(0, pages.length - 1)));
  }, [pages.length]);

  if (pages.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300">
        <div className="text-center">
          <FileCheck2 className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <p className="text-gray-500">Add a page to see the test preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTemplate key={pages[pageIndex].id} page={pages[pageIndex]} pageIndex={pageIndex} runtimeMode="preview" />
      <div className="flex items-center justify-between border-t pt-4">
        <Button variant="outline" disabled={pageIndex === 0} onClick={() => setPageIndex(index => index - 1)}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Previous
        </Button>
        <span className="text-sm text-gray-500">Page {pageIndex + 1} of {pages.length}</span>
        <Button
          variant="outline"
          disabled={pageIndex === pages.length - 1}
          onClick={() => setPageIndex(index => index + 1)}>
          Next <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
