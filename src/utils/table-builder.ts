import type {
  SchemaNode,
  ObjectNode,
  TableGrid,
  NestedTableGrid,
  RowDef,
  ColumnDef,
  CellDef,
  SectionGrid,
  SubsectionGrid,
  LeafKind,
} from '@/src/types/schema-introspection';
import { formatLabel } from './label-formatter';

function extractValue(data: unknown, pathSegments: string[]): string | string[] | null {
  let current: unknown = data;

  for (const segment of pathSegments) {
    if (current == null) return null;
    if (typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[segment];
  }

  if (current === undefined || current === null) return null;
  return current as string | string[];
}

function buildCellPath(groupPath: string[], rowKey: string, colPath: string[]): string {
  return [...groupPath, rowKey, ...colPath].join('.');
}

function calculateDepth(node: SchemaNode): number {
  if (node.kind === 'leaf') return 0;

  const childDepths = Object.values(node.children).map(calculateDepth);
  return 1 + Math.max(...childDepths, 0);
}

function getLeafKind(node: SchemaNode): LeafKind {
  if (node.kind === 'leaf') return node.leafKind;

  const firstChild = Object.values(node.children)[0];
  if (firstChild) return getLeafKind(firstChild);

  return 'unknown';
}

function buildSimpleGrid(node: ObjectNode, data: unknown, groupPath: string[] = []): TableGrid {
  const depth = calculateDepth(node);

  if (depth === 0) {
    return {
      rows: [],
      columns: [],
      cells: [],
    };
  }

  if (depth === 1) {
    const rowKeys = node.keys as string[];
    const rows: RowDef[] = rowKeys.map(key => ({
      key,
      label: formatLabel(key),
    }));

    const columns: ColumnDef[] = [
      {
        path: [],
        label: '',
      },
    ];

    const leafKind = getLeafKind(node);
    const cells: CellDef[][] = rowKeys.map(rowKey => {
      const value = extractValue(data, [...groupPath, rowKey]);
      return [
        {
          path: buildCellPath(groupPath, rowKey, []),
          value,
          rowKey,
          colKey: 'value',
          leafKind,
        },
      ];
    });

    return { rows, columns, cells };
  }

  const firstChildKey = node.keys[0];
  const firstChild = node.children[firstChildKey];

  if (firstChild.kind === 'object') {
    const dim1Keys = node.keys as string[];
    const dim2Keys = firstChild.keys as string[];

    let rowKeys: string[];
    let colKeys: string[];

    if (dim1Keys.length >= dim2Keys.length) {
      rowKeys = dim1Keys;
      colKeys = dim2Keys;
    } else {
      rowKeys = dim2Keys;
      colKeys = dim1Keys;
    }

    const isFlipped = rowKeys === dim2Keys;

    const rows: RowDef[] = rowKeys.map(key => ({
      key,
      label: formatLabel(key),
    }));

    const columns: ColumnDef[] = colKeys.map(key => ({
      path: [key],
      label: formatLabel(key),
    }));

    const leafKind = getLeafKind(node);
    const cells: CellDef[][] = rowKeys.map(rowKey => {
      return colKeys.map(colKey => {
        const pathSegments = isFlipped ? [...groupPath, colKey, rowKey] : [...groupPath, rowKey, colKey];
        const value = extractValue(data, pathSegments);

        return {
          path: pathSegments.join('.'),
          value,
          rowKey,
          colKey,
          leafKind,
        };
      });
    });

    return { rows, columns, cells };
  }

  return {
    rows: [],
    columns: [],
    cells: [],
  };
}

function canUseMultiColumn(node: ObjectNode): boolean {
  const rowKeys = node.keys as string[];
  const firstChild = node.children[rowKeys[0]];

  if (!firstChild || firstChild.kind !== 'object' || !firstChild.uniform) {
    return false;
  }

  const midKeys = firstChild.keys as string[];
  const firstMidChild = firstChild.children[midKeys[0]];

  if (!firstMidChild || firstMidChild.kind !== 'object' || !firstMidChild.uniform) {
    return false;
  }

  const referenceMidSignature = midKeys.join('|');
  const referenceInnerSignature = firstMidChild.keys.join('|');

  return rowKeys.every(rowKey => {
    const childNode = node.children[rowKey];
    if (!childNode || childNode.kind !== 'object' || !childNode.uniform) return false;
    if (childNode.keys.join('|') !== referenceMidSignature) return false;
    return childNode.keys.every(midKey => {
      const midNode = childNode.children[midKey];
      if (!midNode || midNode.kind !== 'object' || !midNode.uniform) return false;
      return midNode.keys.join('|') === referenceInnerSignature;
    });
  });
}

function buildMultiColumnGrid(node: ObjectNode, data: unknown, groupPath: string[] = []): TableGrid {
  const rowKeys = node.keys as string[];
  const firstChild = node.children[rowKeys[0]] as ObjectNode;
  const midKeys = firstChild.keys as string[];
  const firstMidChild = firstChild.children[midKeys[0]] as ObjectNode;
  const innerKeys = firstMidChild.keys as string[];

  const rows: RowDef[] = rowKeys.map(key => ({
    key,
    label: formatLabel(key),
  }));

  const columns: ColumnDef[] = [];
  for (const midKey of midKeys) {
    for (const innerKey of innerKeys) {
      columns.push({
        path: [midKey, innerKey],
        label: `${formatLabel(midKey)} ${formatLabel(innerKey)}`,
      });
    }
  }

  const leafKind = getLeafKind(node);
  const cells: CellDef[][] = rowKeys.map(rowKey => {
    return columns.map(col => {
      const pathSegments = [...groupPath, rowKey, ...col.path];
      const value = extractValue(data, pathSegments);

      return {
        path: pathSegments.join('.'),
        value,
        rowKey,
        colKey: col.path.join('.'),
        leafKind,
      };
    });
  });

  return { rows, columns, cells };
}

function isNestedTableGrid(grid: TableGrid | NestedTableGrid): grid is NestedTableGrid {
  return 'sections' in grid;
}

function combineLabels(...labels: string[]): string {
  const normalized: string[] = [];
  for (const label of labels) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    if (normalized.length === 0 || normalized[normalized.length - 1].toLowerCase() !== trimmed.toLowerCase()) {
      normalized.push(trimmed);
    }
  }
  return normalized.join(' ');
}

function prefixCellPaths(grid: TableGrid | NestedTableGrid, prefix: string): void {
  if ('sections' in grid) {
    grid.sections.forEach(section => {
      section.subsections.forEach(subsection => {
        const fullPrefix = prefix ? `${prefix}.${subsection.key}` : subsection.key;
        prefixCellPaths(subsection.grid, fullPrefix);
      });
    });
  } else {
    grid.cells.forEach(row => {
      row.forEach(cell => {
        cell.path = prefix ? `${prefix}.${cell.path}` : cell.path;
      });
    });
  }
}

function buildNestedGrid(node: ObjectNode, data: unknown, groupPath: string[] = []): NestedTableGrid {
  const sections: SectionGrid[] = [];

  for (const sectionKey of node.keys) {
    const sectionNode = node.children[sectionKey];

    if (sectionNode.kind === 'object') {
      const sectionPath = [...groupPath, sectionKey];
      const sectionData = extractValue(data, sectionPath);
      const sectionGrid = buildTableGrid(sectionNode, sectionData, []);
      const sectionLabel = formatLabel(sectionKey);

      if (isNestedTableGrid(sectionGrid)) {
        const nestedSubsections: SubsectionGrid[] = sectionGrid.sections.flatMap(innerSection =>
          innerSection.subsections.map(subsection => {
            prefixCellPaths(subsection.grid, sectionKey);

            return {
              key: `${sectionKey}.${innerSection.sectionKey}.${subsection.key}`,
              label: combineLabels(formatLabel(innerSection.sectionKey), subsection.label),
              grid: subsection.grid,
            };
          })
        );

        sections.push({
          sectionKey,
          sectionLabel,
          subsections: nestedSubsections,
        });
      } else {
        prefixCellPaths(sectionGrid, sectionKey);
        sections.push({
          sectionKey,
          sectionLabel,
          subsections: [
            {
              key: sectionKey,
              label: '',
              grid: sectionGrid,
            },
          ],
        });
      }
    }
  }

  return { sections };
}

export function buildTableGrid(node: SchemaNode, data: unknown, groupPath: string[] = []): TableGrid | NestedTableGrid {
  if (node.kind === 'leaf') {
    return {
      rows: [],
      columns: [],
      cells: [],
    };
  }

  const depth = calculateDepth(node);

  if (depth <= 1) {
    return buildSimpleGrid(node, data, groupPath);
  }

  if (depth === 2) {
    return buildSimpleGrid(node, data, groupPath);
  }

  if (depth === 3) {
    if (canUseMultiColumn(node)) {
      return buildMultiColumnGrid(node, data, groupPath);
    }
    return buildNestedGrid(node, data, groupPath);
  }

  return buildNestedGrid(node, data, groupPath);
}
