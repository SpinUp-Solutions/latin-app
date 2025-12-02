import { RenderableContentItem } from '@/src/types/page';
import { TooltipData } from '@/src/types/tooltip';
import { Page } from '@/src/types/lesson';

export const generateId = (prefix: string = 'item'): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export interface IdMapping {
  [oldId: string]: string;
}

export const regenerateContentIds = (
  content: RenderableContentItem,
  idMapping: IdMapping = {}
): { content: RenderableContentItem; idMapping: IdMapping } => {
  const newContent = JSON.parse(JSON.stringify(content)) as RenderableContentItem;

  const oldId = newContent.id;
  const newId = generateId('content');
  newContent.id = newId;
  idMapping[oldId] = newId;

  regenerateNestedIds(newContent, idMapping);
  updateIdReferences(newContent, idMapping);

  return { content: newContent, idMapping };
};

const regenerateNestedIds = (obj: unknown, idMapping: IdMapping): void => {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach(item => regenerateNestedIds(item, idMapping));
    return;
  }

  Object.keys(obj as Record<string, unknown>).forEach(key => {
    const objRecord = obj as Record<string, unknown>;
    const value = objRecord[key];

    if (key === 'id' && typeof value === 'string' && value !== objRecord.id) {
      const newId = generateId('nested');
      idMapping[value] = newId;
      objRecord[key] = newId;
    } else if (typeof value === 'object') {
      regenerateNestedIds(value, idMapping);
    }
  });
};

const updateIdReferences = (obj: unknown, idMapping: IdMapping): void => {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach(item => updateIdReferences(item, idMapping));
    return;
  }

  Object.keys(obj as Record<string, unknown>).forEach(key => {
    const objRecord = obj as Record<string, unknown>;
    const value = objRecord[key];

    if (typeof value === 'string') {
      if (key.includes('Id') || key.includes('Ref') || key === 'target') {
        if (idMapping[value]) {
          objRecord[key] = idMapping[value];
        }
      }

      if (value.includes('data-tooltip-id=') || value.includes('id=') || value.includes('data-id=')) {
        let updatedValue = value;
        Object.keys(idMapping).forEach(oldId => {
          const regex = new RegExp(`\\b${oldId}\\b`, 'g');
          updatedValue = updatedValue.replace(regex, idMapping[oldId]);
        });
        objRecord[key] = updatedValue;
      }
    } else if (typeof value === 'object') {
      updateIdReferences(value, idMapping);
    }
  });
};

export const regenerateTooltipIds = (
  tooltips: Record<string, TooltipData>,
  idMapping: IdMapping = {}
): { tooltips: Record<string, TooltipData>; idMapping: IdMapping } => {
  const newTooltips: Record<string, TooltipData> = {};

  Object.entries(tooltips).forEach(([oldId, tooltip]) => {
    const newId = generateId('tooltip');
    idMapping[oldId] = newId;

    newTooltips[newId] = {
      ...tooltip,
      id: newId,
    };
  });

  return { tooltips: newTooltips, idMapping };
};

export const regenerateContentAndTooltipIds = (
  content: RenderableContentItem,
  tooltips: Record<string, TooltipData>
): {
  content: RenderableContentItem;
  tooltips: Record<string, TooltipData>;
  idMapping: IdMapping;
} => {
  let idMapping: IdMapping = {};

  const { content: newContent, idMapping: contentIdMapping } = regenerateContentIds(content, idMapping);
  idMapping = { ...idMapping, ...contentIdMapping };

  const { tooltips: newTooltips, idMapping: tooltipIdMapping } = regenerateTooltipIds(tooltips, idMapping);
  idMapping = { ...idMapping, ...tooltipIdMapping };

  updateIdReferences(newContent, idMapping);

  return {
    content: newContent,
    tooltips: newTooltips,
    idMapping,
  };
};

export const regeneratePageIds = (
  page: Page,
  tooltips: Record<string, TooltipData>
): {
  page: Page;
  tooltips: Record<string, TooltipData>;
  idMapping: IdMapping;
} => {
  let idMapping: IdMapping = {};
  let accumulatedTooltips: Record<string, TooltipData> = {};

  const newPage: Page = JSON.parse(JSON.stringify(page));

  const oldPageId = newPage.id;
  const newPageId = generateId('page');
  newPage.id = newPageId;
  idMapping[oldPageId] = newPageId;

  if (newPage.title) {
    newPage.title = `${newPage.title} (Copy)`;
  } else {
    newPage.title = 'New Page (Copy)';
  }

  newPage.items = newPage.items.map(item => {
    const {
      content: newContent,
      tooltips: newTooltips,
      idMapping: itemIdMapping,
    } = regenerateContentAndTooltipIds(item, tooltips);
    idMapping = { ...idMapping, ...itemIdMapping };
    accumulatedTooltips = { ...accumulatedTooltips, ...newTooltips };
    return newContent;
  });

  return {
    page: newPage,
    tooltips: accumulatedTooltips,
    idMapping,
  };
};
