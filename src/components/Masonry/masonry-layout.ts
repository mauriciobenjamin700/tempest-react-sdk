/**
 * Column count for a width, from a breakpoint map.
 *
 * The map is read as "from this width up", so `{ 0: 1, 640: 2, 1024: 3 }` means one
 * column on a phone and three on a desktop. Keys are sorted here rather than
 * trusted in insertion order — an object literal written out of order would
 * otherwise pick the wrong column count, silently.
 *
 * @param width - Container width in pixels.
 * @param columns - Breakpoint → column count, or a fixed number.
 * @returns At least 1, always.
 */
export function columnsFor(width: number, columns: number | Record<number, number>): number {
    if (typeof columns === "number") return Math.max(1, Math.floor(columns));
    const steps = Object.keys(columns)
        .map(Number)
        .filter((key) => Number.isFinite(key))
        .sort((a, b) => a - b);
    let count = 1;
    for (const step of steps) {
        if (width >= step) count = columns[step];
    }
    return Math.max(1, Math.floor(count));
}

/**
 * Deal items into columns, shortest column first.
 *
 * Round-robin (`index % columns`) is the obvious approach and produces ragged
 * columns the moment items differ in height — which is the only reason to reach
 * for a masonry layout at all. Feeding the shortest column keeps the bottom edge
 * as even as the content allows.
 *
 * Reading order is the cost, and it is why this is a layout for **independent**
 * cards: down a column rather than across the row. A list where item 2 must follow
 * item 1 wants a grid, not this.
 *
 * @param heights - Estimated or measured height per item, in the items' order.
 * @param columnCount - How many columns to fill.
 * @returns Item indexes per column.
 */
export function distribute(heights: readonly number[], columnCount: number): number[][] {
    const count = Math.max(1, Math.floor(columnCount));
    const columns: number[][] = Array.from({ length: count }, () => []);
    const totals = new Array<number>(count).fill(0);

    for (let index = 0; index < heights.length; index += 1) {
        let shortest = 0;
        for (let column = 1; column < count; column += 1) {
            if (totals[column] < totals[shortest]) shortest = column;
        }
        columns[shortest].push(index);
        totals[shortest] += Math.max(1, heights[index] ?? 1);
    }

    return columns;
}
