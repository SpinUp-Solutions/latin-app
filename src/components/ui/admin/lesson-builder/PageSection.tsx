import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';
import { IntroductionPage, ExercisePage } from '@/src/types/lesson';
import { RenderableContentItem } from '@/src/types/page';
import { ContentItem } from './ContentItem';
import { createNewContent } from '@/src/utils/contentFactory';
import { SimpleRichEditor } from '../../core/simple-rich-editor';

interface PageSectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  pages: (IntroductionPage | ExercisePage)[];
  pageType: 'introduction' | 'exercises';
  contentTypes: readonly { type: string; icon: React.ComponentType<{ className?: string }>; label: string }[];
  onAddPage: () => void;
  onRemovePage: (pageIndex: number) => void;
  onUpdatePageTitle: (pageIndex: number, title: string) => void;
  onAddContent: (pageIndex: number, content: RenderableContentItem) => void;
  onEditContent: (pageIndex: number, itemIndex: number) => void;
  onRemoveContent: (pageIndex: number, itemIndex: number) => void;
}

export const PageSection: React.FC<PageSectionProps> = ({
  title,
  icon: Icon,
  pages,
  contentTypes,
  onAddPage,
  onRemovePage,
  onUpdatePageTitle,
  onAddContent,
  onEditContent,
  onRemoveContent,
}) => {
  const handleAddContent = (pageIndex: number, contentType: string) => {
    const newContent = createNewContent(contentType);
    onAddContent(pageIndex, newContent);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {title} ({pages.length})
          </span>
          <Button onClick={onAddPage} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Page
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pages.map((page, pageIndex) => (
          <div key={page.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <SimpleRichEditor
                content={page.title || ''}
                onChange={value => onUpdatePageTitle(pageIndex, value)}
                className="text-lg font-medium bg-transparent border-none outline-none"
                placeholder="Page title..."
                singleLine={true}
              />
              <Button variant="ghost" size="sm" onClick={() => onRemovePage(pageIndex)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Content Items */}
            <div className="space-y-2">
              {page.items.map((item, itemIndex) => (
                <ContentItem
                  key={item.id}
                  item={item}
                  onEdit={() => onEditContent(pageIndex, itemIndex)}
                  onRemove={() => onRemoveContent(pageIndex, itemIndex)}
                />
              ))}
            </div>

            {/* Add Content Buttons */}
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {contentTypes.map(({ type, icon: ContentIcon, label }) => (
                <Button key={type} variant="outline" size="sm" onClick={() => handleAddContent(pageIndex, type)}>
                  <ContentIcon className="h-4 w-4 mr-1" />
                  {label}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
