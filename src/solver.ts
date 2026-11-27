import { CELL_COUNT, SIZE } from './model';

const BOX: readonly number[] = Array.from(
  { length: CELL_COUNT },
  (_, i) => Math.floor(i / 27) * 3 + Math.floor((i % SIZE) / 3),
);
const ALL = 0x3fe; // 비트 1~9

/**
 * 문제(81칸, 빈칸 0)의 해 개수를 limit 개까지 센다.
 * 후보가 가장 적은 칸부터 채우는 백트래킹이라, 어려운 문제도 수 ms 안에 끝난다.
 * 제시 숫자끼리 충돌하면 0.
 */
export function countSolutions(puzzle: readonly number[], limit = 2): number {
  const g = Int8Array.from(puzzle);
  const row = new Int16Array(SIZE);
  const col = new Int16Array(SIZE);
  const box = new Int16Array(SIZE);
  for (let i = 0; i < CELL_COUNT; i++) {
    if (!g[i]) continue;
    const b = 1 << g[i]!;
    const r = (i / SIZE) | 0;
    const c = i % SIZE;
    if ((row[r]! | col[c]! | box[BOX[i]!]!) & b) return 0;
    row[r]! |= b;
    col[c]! |= b;
    box[BOX[i]!]! |= b;
  }

  let found = 0;
  const search = (): void => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < CELL_COUNT; i++) {
      if (g[i]) continue;
      const m = ~(row[(i / SIZE) | 0]! | col[i % SIZE]! | box[BOX[i]!]!) & ALL;
      let n = 0;
      for (let x = m; x; x &= x - 1) n++;
      if (n < bestCount) {
        best = i;
        bestMask = m;
        bestCount = n;
        if (n <= 1) break;
      }
    }
    if (best < 0) {
      found++;
      return;
    }
    if (bestCount === 0) return;
    const r = (best / SIZE) | 0;
    const c = best % SIZE;
    const bx = BOX[best]!;
    for (let m = bestMask; m; m &= m - 1) {
      const b = m & -m;
      g[best] = 31 - Math.clz32(b);
      row[r]! |= b;
      col[c]! |= b;
      box[bx]! |= b;
      search();
      row[r]! &= ~b;
      col[c]! &= ~b;
      box[bx]! &= ~b;
      g[best] = 0;
      if (found >= limit) return;
    }
  };
  search();
  return found;
}

export const hasUniqueSolution = (puzzle: readonly number[]): boolean => countSolutions(puzzle, 2) === 1;
