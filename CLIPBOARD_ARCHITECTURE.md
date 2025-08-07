# Clipboard Architecture Documentation

## Overview

The clipboard system enables copying and pasting content items between different pages and lessons in the admin lesson builder. It includes intelligent tooltip extraction, ID regeneration, and seamless cross-lesson functionality.

## Core Features

- **Content Item Copying**: Copy any content item with associated tooltips
- **Cross-Lesson Pasting**: Paste content between different lessons
- **Selective Tooltip Extraction**: Only tooltips from the copied content are included
- **ID Conflict Prevention**: All IDs are regenerated to prevent conflicts
- **Visual Feedback**: Toast notifications and paste zones provide clear UX

## Architecture Components

### 1. Redux State Management

#### `clipboardSlice.ts`
All clipboard types are now consolidated in `types/clipboard.d.ts`:

```typescript
// Unified page type
export type PageType = 'introduction' | 'exercises';

// Unified location interface
export interface ClipboardLocation {
  pageType: PageType;
  pageIndex: number;
  lesson?: string;
}

// Streamlined clipboard item
export interface ClipboardItem {
  content: RenderableContentItem;
  associatedTooltips: Record<string, TooltipData>;
  source?: ClipboardSource;
  copiedAt: string;
}
```

**Key Actions:**
- `copyContentItem`: Stores content + extracted tooltips
- `pasteContentItem`: Returns content with regenerated IDs
- `clearClipboard`: Clears clipboard history

**State Features:**
- Maintains clipboard history (max 10 items)
- Stores metadata about content source
- Automatic tooltip extraction on copy

### 2. ID Management System

#### `idUtils.ts`
Handles the complex task of regenerating IDs to prevent conflicts when pasting.

**Key Functions:**

```typescript
// Regenerates content IDs and updates internal references
regenerateContentIds(content: RenderableContentItem): {
  content: RenderableContentItem;
  idMapping: IdMapping;
}

// Regenerates tooltip IDs
regenerateTooltipIds(tooltips: Record<string, TooltipData>): {
  tooltips: Record<string, TooltipData>;
  idMapping: IdMapping;
}

// Combines both content and tooltip ID regeneration
regenerateContentAndTooltipIds(content, tooltips): {
  content: RenderableContentItem;
  tooltips: Record<string, TooltipData>;
  idMapping: IdMapping;
}
```

**ID Regeneration Process:**
1. Generate new UUIDs for all content and tooltip IDs
2. Create mapping of old IDs to new IDs
3. Update HTML content references (data-tooltip-id attributes)
4. Update internal object references

### 3. Tooltip Extraction System

#### `tooltipUtils.ts`
Provides selective tooltip extraction to avoid copying entire lesson tooltip dictionaries.

```typescript
// Extracts only tooltips used by a specific content item
extractTooltipsFromContentItem(item: RenderableContentItem): Record<string, TooltipData>
```

**Extraction Logic:**
- Scans `item.content` (TipTap HTML content)
- Scans `item.data.sentence.content` (exercise content)
- Recursively searches nested objects
- Parses HTML for `data-tooltip-id` attributes

### 4. UI Components

#### `ClipboardProvider.tsx`
React context provider that wraps the lesson builder and provides clipboard functionality.

```typescript
// All types imported from types/clipboard.d.ts
interface ClipboardContextType {
  copyItem: (content: RenderableContentItem, source?: ClipboardSource) => void;
  pasteItem: (target: ClipboardTarget) => void;
  hasItems: boolean;
  clearItems: () => void;
  clipboardItems: ClipboardItem[];
}
```

**Integration Points:**
- Wraps `LessonBuilder` in both create and edit pages
- Connects clipboard actions to Redux
- Handles tooltip merging on paste

#### `PasteZone.tsx`
Appears automatically in page sections when clipboard contains items.

**Features:**
- Only shows when `hasItems` is true
- Displays content preview (title + type)
- Blue dashed border for visual distinction
- Click to paste functionality

#### Enhanced `ContentItem.tsx`
Content items now include copy functionality.

**Added Features:**
- Copy button (📋 icon) next to edit/delete
- `useClipboard` hook integration
- Toast notification on successful copy
- No interference with existing drag/drop

## Data Flow

### Copy Process
```
1. User clicks copy button on ContentItem
2. ContentItem calls copyItem() from useClipboard
3. ClipboardProvider dispatches copyContentItem action
4. Redux slice:
   - Deep clones content item
   - Calls extractTooltipsFromContentItem()
   - Stores ClipboardItem with content + tooltips + metadata
5. Toast notification confirms copy
6. PasteZones become visible across all pages
```

### Paste Process
```
1. User clicks paste button in PasteZone
2. PasteZone calls pasteItem() from useClipboard
3. ClipboardProvider dispatches pasteContentItem()
4. Redux slice calls regenerateContentAndTooltipIds():
   - Generates new IDs for content and tooltips
   - Updates HTML references to use new tooltip IDs
   - Returns regenerated content + tooltips
5. ClipboardProvider dispatches:
   - addContentToPage() with new content
   - loadTooltips() with regenerated tooltips
6. Content appears in target page with working tooltips
```

## Integration with Existing Systems

### Lesson Builder
- `ClipboardProvider` wraps the entire `LessonBuilder`
- No changes to existing lesson state management
- Seamless integration with drag-and-drop functionality

### Tooltip System
- Uses existing `TooltipData` types
- Integrates with `lessonSlice.tooltips` state
- Preserves tooltip functionality across copy/paste

### Content Types
- Works with all existing `RenderableContentItem` types
- No modifications needed for new content types
- Extensible for future content structures

## File Structure

```
src/
├── types/
│   └── clipboard.d.ts              # Consolidated clipboard types
├── components/ui/core/clipboard/
│   ├── index.ts                     # Exports
│   ├── ClipboardProvider.tsx        # Context provider  
│   └── PasteZone.tsx               # Paste UI component
├── store/slices/
│   └── clipboardSlice.ts           # Redux state management
├── utils/
│   ├── idUtils.ts                  # ID regeneration utilities
│   └── tooltipUtils.ts             # Tooltip extraction (enhanced)
└── app/admin/lessons/
    ├── create/page.tsx             # Wrapped with ClipboardProvider
    └── edit/[id]/page.tsx          # Wrapped with ClipboardProvider
```

## Usage Examples

### Basic Copy/Paste
```typescript
// Copy (handled automatically in ContentItem)
const handleCopy = () => {
  copyItem(item);
  toast.success(`Copied "${item.title}" to clipboard`);
};

// Paste (handled automatically in PasteZone)
const handlePaste = () => {
  pasteItem({ pageType: 'introduction', pageIndex: 0 });
};
```

### Cross-Lesson Workflow
1. Create/edit lesson A
2. Copy content item with tooltips
3. Navigate to lesson B
4. Paste content item
5. All tooltips work with new IDs, no conflicts

## Technical Considerations

### Performance
- Clipboard operations are synchronous and fast
- Deep cloning only occurs on copy (not on every render)
- Selective tooltip extraction minimizes data transfer

### Memory Management
- Clipboard history limited to 10 items
- Old items automatically pruned
- No memory leaks from DOM references

### Error Handling
- Graceful fallbacks if clipboard is empty
- Toast notifications for user feedback
- Redux error boundaries handle edge cases

### Accessibility
- All clipboard actions use proper ARIA labels
- Keyboard navigation supported
- Screen reader friendly notifications

## Future Enhancements

### Potential Additions
- **Keyboard shortcuts** (Ctrl+C, Ctrl+V)
- **Clipboard panel** showing multiple copied items
- **Batch operations** for copying multiple items
- **Export/import** clipboard to/from JSON
- **Undo/redo** for paste operations

### Extension Points
- New content types automatically supported
- Custom tooltip extraction logic can be added
- Additional metadata can be stored with copied items
- Integration with external clipboard APIs possible

## Troubleshooting

### Common Issues

**Paste zones not appearing:**
- Ensure content was copied successfully (check toast notification)
- Verify ClipboardProvider wraps the component tree

**Tooltips not working after paste:**
- Check if `loadTooltips` action is dispatched
- Verify tooltip ID regeneration in browser dev tools

**Content not pasting:**
- Confirm target page/index is valid
- Check Redux state for clipboard items
- Verify `addContentToPage` action succeeds

### Debugging
- Use Redux DevTools to inspect clipboard state
- Check console for ID mapping during regeneration
- Verify DOM for updated `data-tooltip-id` attributes

## Conclusion

The clipboard system provides a robust, user-friendly way to copy and paste content items while maintaining data integrity and tooltip functionality. Its clean architecture integrates seamlessly with existing systems and provides a foundation for future enhancements.