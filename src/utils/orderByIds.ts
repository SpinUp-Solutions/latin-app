export const orderByIds = <T extends { id: string }>(items: readonly T[], orderedIds: readonly string[]) => {
  const byId = new Map(items.map(item => [item.id, item]));
  const reordered = orderedIds.map(id => byId.get(id)).filter((item): item is T => Boolean(item));
  const reorderedIds = new Set(orderedIds);
  return [...reordered, ...items.filter(item => !reorderedIds.has(item.id))];
};

export const haveSameIdOrder = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);
