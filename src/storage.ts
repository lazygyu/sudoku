import type { Difficulty, Puzzle } from './api';
import type { HistoryData } from './history';
import type { Cell } from './model';
import { hasUniqueSolution } from './solver';

/** localStorage 는 사생활 보호 모드 등에서 실패할 수 있으므로 모두 try/catch 로 감싼다 */
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 실패는 무시 */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

const KEY_GAME = 'sudoku:game:v1';
const KEY_SETTINGS = 'sudoku:settings:v1';
const KEY_SPARE = 'sudoku:spare:v1';
/** 예전 dosuku API 시절의 문제 목록 (더 이상 쓰지 않음) */
const KEY_OLD_PUZZLES = 'sudoku:puzzles:v1';
const KEY_SOLVED = 'sudoku:solved:v1';

export interface SavedGame {
  puzzle: Puzzle;
  cells: Cell[];
  history: HistoryData;
  elapsedMs: number;
  /** 사용자가 찍어둔 보드 스냅샷 (없으면 생략) */
  snapshot?: Cell[];
}

export interface Settings {
  /** 정답과 다른 답을 즉시 표시 */
  showMistakes: boolean;
  /** 새 게임 시작 시 제시 숫자 기준 후보를 모두 노트로 채움 */
  autoFillNotes: boolean;
  /** API Ninjas 키 (사용자가 직접 입력, 비어 있으면 빌드 기본 키 사용) */
  apiKey: string;
}

const DEFAULT_SETTINGS: Settings = { showMistakes: false, autoFillNotes: false, apiKey: '' };

export const loadGame = (): SavedGame | null => {
  const g = read<SavedGame>(KEY_GAME);
  return g && Array.isArray(g.cells) && g.cells.length === 81 && g.puzzle ? g : null;
};
export const saveGame = (g: SavedGame): void => write(KEY_GAME, g);
export const clearGame = (): void => remove(KEY_GAME);

export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...read<Settings>(KEY_SETTINGS) });
export const saveSettings = (s: Settings): void => write(KEY_SETTINGS, s);

/**
 * 난이도별로 미리 받아둔 문제 하나씩.
 * 새 게임을 바로 시작할 수 있고, 오프라인에서도 한 판은 할 수 있다.
 */
type SpareMap = Partial<Record<Difficulty, Puzzle>>;
const loadSpares = (): SpareMap => read<SpareMap>(KEY_SPARE) ?? {};
export function loadSpare(d: Difficulty): Puzzle | null {
  const p = loadSpares()[d];
  if (!p) return null;
  // 유일해 검사를 넣기 전에 받아둔 문제일 수 있으므로 다시 확인한다
  if (!Array.isArray(p.value) || p.value.length !== 81 || !hasUniqueSolution(p.value)) {
    saveSpare(d, null);
    return null;
  }
  return p;
}
export function saveSpare(d: Difficulty, p: Puzzle | null): void {
  const spares = loadSpares();
  if (p) spares[d] = p;
  else delete spares[d];
  write(KEY_SPARE, spares);
}

remove(KEY_OLD_PUZZLES);

/** 완료한 문제 id → 기록(ms) */
export const loadSolved = (): Record<string, number> => read<Record<string, number>>(KEY_SOLVED) ?? {};
export function markSolved(id: string, ms: number): void {
  const solved = loadSolved();
  if (!(id in solved) || ms < solved[id]!) solved[id] = ms;
  write(KEY_SOLVED, solved);
}
