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

const asRecord = (value: unknown): Record<string, unknown> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
);

const regenerateEntityIds = (value: unknown, idMapping: IdMapping): void => {
  if (!Array.isArray(value)) return;

  value.forEach(entity => {
    const record = asRecord(entity);
    if (!record || typeof record.id !== 'string') return;
    const oldId = record.id;
    const newId = idMapping[oldId] ?? generateId('nested');
    idMapping[oldId] = newId;
    record.id = newId;
  });
};

/**
 * Regenerates only authored entity identities declared by persisted content
 * schemas. Some nested `id` fields are canonical data, not copy identities:
 * sentence-diagram token IDs are derived from token indexes and annotation IDs
 * are derived from their kind/span. Replacing those makes a copied diagram
 * invalid, so sentence-diagramming intentionally has no nested ID route here.
 */
const regenerateNestedIds = (content: RenderableContentItem, idMapping: IdMapping): void => {
  const record = content as unknown as Record<string, unknown>;
  const data = asRecord(record.data);

  switch (content.type) {
    case 'matching':
      regenerateEntityIds(data?.leftColumn, idMapping);
      regenerateEntityIds(data?.rightColumn, idMapping);
      // Retained for persisted legacy matching documents that model an
      // authored pair as its own entity.
      regenerateEntityIds(data?.pairs, idMapping);
      break;
    case 'multiple-choice':
      regenerateEntityIds(data?.options, idMapping);
      break;
    case 'odd-one-out':
      regenerateEntityIds(data?.items, idMapping);
      break;
    case 'table-fill':
      regenerateEntityIds(data?.columns, idMapping);
      regenerateEntityIds(data?.rows, idMapping);
      break;
    case 'text-selection':
      regenerateEntityIds(data?.questions, idMapping);
      break;
    case 'vocabulary':
      regenerateEntityIds(record.vocabularyItems, idMapping);
      break;
    case 'table': {
      const tableData = asRecord(record.tableData);
      regenerateEntityIds(tableData?.columns, idMapping);
      regenerateEntityIds(tableData?.rows, idMapping);
      break;
    }
    default:
      break;
  }
};

const isReferenceValueKey = (key: string): boolean => (
  key === 'target'
  || /(?:target|source|left|right|from|to)(?:Id|Ref)$/i.test(key)
);

const hasIdentityKeys = (key: string): boolean => (
  key === 'answers'
  || key === 'cells'
  || /(?:By|To)(?:Id|Ref)$/i.test(key)
);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const updateIdReferences = (obj: unknown, idMapping: IdMapping, parentKey?: string): void => {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach(item => updateIdReferences(item, idMapping, parentKey));
    return;
  }

  const objRecord = obj as Record<string, unknown>;

  // Matching answers are keyed by left-column IDs, and table row cells are
  // keyed by column IDs. These are references too, even though they are
  // object keys rather than values.
  if (parentKey && hasIdentityKeys(parentKey)) {
    Object.keys(objRecord).forEach(key => {
      const mappedKey = idMapping[key];
      if (mappedKey && mappedKey !== key) {
        objRecord[mappedKey] = objRecord[key];
        delete objRecord[key];
      }
    });
  }

  Object.entries(objRecord).forEach(([key, value]) => {

    if (typeof value === 'string') {
      if (parentKey === 'answers' || isReferenceValueKey(key)) {
        if (idMapping[value]) {
          objRecord[key] = idMapping[value];
        }
      }

      if (value.includes('data-tooltip-id=') || value.includes('id=') || value.includes('data-id=')) {
        let updatedValue = value;
        Object.keys(idMapping).forEach(oldId => {
          const regex = new RegExp(`\\b${escapeRegExp(oldId)}\\b`, 'g');
          updatedValue = updatedValue.replace(regex, idMapping[oldId]);
        });
        objRecord[key] = updatedValue;
      }
    } else if (typeof value === 'object') {
      updateIdReferences(value, idMapping, key);
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
