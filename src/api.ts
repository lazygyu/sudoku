import { CELL_COUNT } from './model';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export const DIFFICULTIES: readonly Difficulty[] = ['Easy', 'Medium', 'Hard'];

export interface Puzzle {
  id: string;
  /** 81칸, 빈칸은 0 */
  value: number[];
  solution: number[];
  /** 예전에 저장된 게임과의 호환을 위해 string 으로 둔다 */
  difficulty: string;
}

const ENDPOINT = 'https://api.api-ninjas.com/v1/sudokugenerate';

/** 빌드할 때 넣어두는 기본 키 (없으면 사용자가 앱에서 입력한 키를 쓴다) */
export const BUILT_IN_KEY: string = import.meta.env.VITE_API_NINJAS_KEY ?? '';

/** 9×9 2차원 배열을 81칸 배열로 편다. 빈칸(null/0)은 0 */
function flatten(grid: unknown, allowEmpty: boolean): number[] | null {
  if (!Array.isArray(grid) || grid.length !== 9) return null;
  if (!grid.every((row) => Array.isArray(row) && row.length === 9)) return null;
  const flat = (grid as unknown[][]).flat().map((v) => (v === null ? 0 : v));
  if (flat.length !== CELL_COUNT) return null;
  const min = allowEmpty ? 0 : 1;
  if (!flat.every((v) => Number.isInteger(v) && (v as number) >= min && (v as number) <= 9)) return null;
  return flat as number[];
}

/** 정답이 스도쿠 규칙(행/열/박스에 1~9 한 번씩)을 만족하는지 */
function isValidSolution(s: readonly number[]): boolean {
  for (let k = 0; k < 9; k++) {
    const row = new Set<number>();
    const col = new Set<number>();
    const box = new Set<number>();
    for (let j = 0; j < 9; j++) {
      row.add(s[k * 9 + j]!);
      col.add(s[j * 9 + k]!);
      const r = Math.floor(k / 3) * 3 + Math.floor(j / 3);
      const c = (k % 3) * 3 + (j % 3);
      box.add(s[r * 9 + c]!);
    }
    if (row.size !== 9 || col.size !== 9 || box.size !== 9) return false;
  }
  return true;
}

/** 같은 문제는 같은 id 를 갖도록 문제 숫자열에서 id 를 만든다 */
export const puzzleId = (value: readonly number[]): string => value.join('');

export function parseResponse(json: unknown, difficulty: Difficulty): Puzzle {
  const raw = json as { puzzle?: unknown; solution?: unknown } | null;
  const value = flatten(raw?.puzzle, true);
  const solution = flatten(raw?.solution, false);
  if (!value || !solution) throw new Error('예상하지 못한 응답 형식입니다');
  if (!isValidSolution(solution)) throw new Error('정답이 올바르지 않은 문제를 받았습니다');
  if (value.some((v, i) => v !== 0 && v !== solution[i])) throw new Error('제시 숫자가 정답과 맞지 않는 문제를 받았습니다');
  return { id: puzzleId(value), value, solution, difficulty };
}

export class ApiKeyError extends Error {}

export async function fetchPuzzle(difficulty: Difficulty, apiKey: string, timeoutMs = 15000): Promise<Puzzle> {
  if (!apiKey) throw new ApiKeyError('API 키가 없습니다');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${ENDPOINT}?difficulty=${difficulty.toLowerCase()}`, {
      headers: { 'X-Api-Key': apiKey },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* 본문이 JSON 이 아님 */
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const msg = (json as { error?: unknown } | null)?.error;
      throw new ApiKeyError(typeof msg === 'string' ? `API 키 오류: ${msg}` : 'API 키가 올바르지 않습니다');
    }
    if (res.status === 429) throw new Error('이번 달 요청 한도를 넘었습니다');
    if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
    if (json === null) throw new Error('서버가 올바르게 응답하지 않았습니다');
    return parseResponse(json, difficulty);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('요청 시간이 초과되었습니다');
    if (e instanceof TypeError) throw new Error('네트워크에 연결할 수 없습니다');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const DIFFICULTY_LABEL: Record<string, string> = {
  Easy: '쉬움',
  Medium: '보통',
  Hard: '어려움',
};
export const difficultyLabel = (d: string): string => DIFFICULTY_LABEL[d] ?? d;
