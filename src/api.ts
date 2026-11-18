import { CELL_COUNT } from './model';

export interface Puzzle {
  id: string;
  /** 81칸, 빈칸은 0 */
  value: number[];
  solution: number[];
  difficulty: string;
}

const ENDPOINT = 'https://sudoku-api.vercel.app/api/dosuku';
/** limit 20 은 서버 타임아웃이 나서 10으로 제한 */
export const BATCH_SIZE = 10;

interface RawGrid {
  value: unknown;
  solution: unknown;
  difficulty: unknown;
}

function flatten(grid: unknown): number[] | null {
  if (!Array.isArray(grid) || grid.length !== 9) return null;
  const flat = grid.flat();
  if (flat.length !== CELL_COUNT) return null;
  if (!flat.every((v) => Number.isInteger(v) && v >= 0 && v <= 9)) return null;
  return flat as number[];
}

/** 같은 문제는 같은 id 를 갖도록 문제 숫자열에서 id 를 만든다 */
export const puzzleId = (value: readonly number[]): string => value.join('');

export function parseResponse(json: unknown): Puzzle[] {
  const grids = (json as { newboard?: { grids?: RawGrid[] } })?.newboard?.grids;
  if (!Array.isArray(grids)) throw new Error('예상하지 못한 응답 형식입니다');
  const out: Puzzle[] = [];
  for (const g of grids) {
    const value = flatten(g.value);
    const solution = flatten(g.solution);
    if (!value || !solution || solution.includes(0)) continue;
    // 제시 숫자가 정답과 다르면 버린다
    if (value.some((v, i) => v !== 0 && v !== solution[i])) continue;
    out.push({
      id: puzzleId(value),
      value,
      solution,
      difficulty: typeof g.difficulty === 'string' ? g.difficulty : 'Unknown',
    });
  }
  return out;
}

export async function fetchPuzzles(limit = BATCH_SIZE, timeoutMs = 15000): Promise<Puzzle[]> {
  const query = `{newboard(limit:${limit}){grids{value,solution,difficulty},results,message}}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}`, {
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('서버가 응답하지 않았습니다');
    }
    return parseResponse(json);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('요청 시간이 초과되었습니다');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const DIFFICULTY_ORDER: Record<string, number> = { Easy: 0, Medium: 1, Hard: 2 };
export const difficultyRank = (d: string): number => DIFFICULTY_ORDER[d] ?? 3;

export const DIFFICULTY_LABEL: Record<string, string> = {
  Easy: '쉬움',
  Medium: '보통',
  Hard: '어려움',
};
export const difficultyLabel = (d: string): string => DIFFICULTY_LABEL[d] ?? d;
