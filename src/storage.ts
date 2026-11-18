import type { Puzzle } from './api';
import type { HistoryData } from './history';
import type { Cell } from './model';

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
const KEY_PUZZLES = 'sudoku:puzzles:v1';
const KEY_SOLVED = 'sudoku:solved:v1';

export interface SavedGame {
  puzzle: Puzzle;
  cells: Cell[];
  history: HistoryData;
  elapsedMs: number;
}

export interface Settings {
  /** 정답과 다른 답을 즉시 표시 */
  showMistakes: boolean;
  /** 새 게임 시작 시 제시 숫자 기준 후보를 모두 노트로 채움 */
  autoFillNotes: boolean;
}

const DEFAULT_SETTINGS: Settings = { showMistakes: false, autoFillNotes: false };

export const loadGame = (): SavedGame | null => {
  const g = read<SavedGame>(KEY_GAME);
  return g && Array.isArray(g.cells) && g.cells.length === 81 && g.puzzle ? g : null;
};
export const saveGame = (g: SavedGame): void => write(KEY_GAME, g);
export const clearGame = (): void => remove(KEY_GAME);

export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...read<Settings>(KEY_SETTINGS) });
export const saveSettings = (s: Settings): void => write(KEY_SETTINGS, s);

/** 마지막으로 받아온 문제 목록 (오프라인에서도 목록을 보여주기 위함) */
export const loadPuzzleList = (): Puzzle[] => read<Puzzle[]>(KEY_PUZZLES) ?? [];
export const savePuzzleList = (list: Puzzle[]): void => write(KEY_PUZZLES, list.slice(-60));

/** 완료한 문제 id → 기록(ms) */
export const loadSolved = (): Record<string, number> => read<Record<string, number>>(KEY_SOLVED) ?? {};
export function markSolved(id: string, ms: number): void {
  const solved = loadSolved();
  if (!(id in solved) || ms < solved[id]!) solved[id] = ms;
  write(KEY_SOLVED, solved);
}
