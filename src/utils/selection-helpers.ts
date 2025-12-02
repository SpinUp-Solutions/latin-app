import type { TableGrid, NestedTableGrid } from '@/src/types/schema-introspection';

export function getAllPathsFromRow(grid: TableGrid, rowIdx: number): string[] {
  const row = grid.cells[rowIdx];
  if (!row) return [];
  return row.map(cell => cell.path).filter((path): path is string => path !== null && path !== undefined);
}

export function getAllPathsFromColumn(grid: TableGrid, colIdx: number): string[] {
  const paths: string[] = [];
  for (const row of grid.cells) {
    const cell = row[colIdx];
    if (cell && cell.path) {
      paths.push(cell.path);
    }
  }
  return paths;
}

export function getAllPathsFromGrid(grid: TableGrid): string[] {
  const paths: string[] = [];
  for (const row of grid.cells) {
    for (const cell of row) {
      if (cell && cell.path) {
        paths.push(cell.path);
      }
    }
  }
  return paths;
}

export function getAllPathsFromNestedGrid(nestedGrid: NestedTableGrid): string[] {
  const paths: string[] = [];

  function traverse(g: TableGrid | NestedTableGrid) {
    if ('sections' in g) {
      for (const section of g.sections) {
        for (const subsection of section.subsections) {
          traverse(subsection.grid);
        }
      }
    } else {
      paths.push(...getAllPathsFromGrid(g));
    }
  }

  traverse(nestedGrid);
  return paths;
}
