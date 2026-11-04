// As near square a grid as fits the count, but a column more and a row fewer when that still fits,
// which leaves fewer cells empty on a screen wider than tall.
export const columnsFor = (count: number) => {
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);

  return rows > 1 && (columns + 1) * (rows - 1) >= count
    ? columns + 1
    : columns;
};
