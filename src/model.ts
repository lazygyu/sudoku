/**
 * 스도쿠 보드의 순수 규칙 모음.
 * 모든 동작 함수는 원본을 수정하지 않고 변경 목록(Change[])을 돌려준다.
 * 변경 목록은 그대로 undo/redo 히스토리에 쌓인다.
 */

export const SIZE = 9;
export const CELL_COUNT = SIZE * SIZE;

export interface Cell {
  /** 원래 제시된 숫자 (없으면 0) */
  readonly given: number;
  /** 사용자가 입력한 답 (없으면 0) */
  readonly answer: number;
  /** 노트 비트마스크: (1 << d) 가 켜져 있으면 숫자 d 노트 존재 */
  readonly notes: number;
}

export interface Change {
  readonly index: number;
  readonly before: Cell;
  readonly after: Cell;
}

export type Board = readonly Cell[];

export const rowOf = (i: number): number => Math.floor(i / SIZE);
export const colOf = (i: number): number => i % SIZE;
export const boxOf = (i: number): number =>
  Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/** 각 칸과 같은 행/열/박스에 있는 다른 칸 목록 (자기 자신 제외) */
export const PEERS: readonly (readonly number[])[] = Array.from({ length: CELL_COUNT }, (_, i) => {
  const peers: number[] = [];
  for (let j = 0; j < CELL_COUNT; j++) {
    if (j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))) {
      peers.push(j);
    }
  }
  return peers;
});

export const valueOf = (c: Cell): number => c.given || c.answer;
export const hasNote = (c: Cell, d: number): boolean => (c.notes & (1 << d)) !== 0;
export const noteDigits = (c: Cell): number[] => {
  const out: number[] = [];
  for (let d = 1; d <= SIZE; d++) if (hasNote(c, d)) out.push(d);
  return out;
};

export function createBoard(values: readonly number[]): Cell[] {
  if (values.length !== CELL_COUNT) throw new Error(`board must have ${CELL_COUNT} cells`);
  return values.map((v) => ({ given: v, answer: 0, notes: 0 }));
}

const sameCell = (a: Cell, b: Cell): boolean =>
  a.given === b.given && a.answer === b.answer && a.notes === b.notes;

function change(board: Board, index: number, after: Cell): Change | null {
  const before = board[index]!;
  return sameCell(before, after) ? null : { index, before, after };
}

const ALL_NOTES = 0b1111111110; // 1..9

/** 칸에 들어갈 수 있는 후보 비트마스크 (같은 행/열/박스에 이미 있는 숫자 제외) */
export function candidateMask(board: Board, index: number): number {
  let used = 0;
  for (const p of PEERS[index]!) {
    const v = valueOf(board[p]!);
    if (v) used |= 1 << v;
  }
  return ALL_NOTES & ~used;
}

/** 빈 칸마다 현재 보드 기준의 후보 숫자를 모두 노트로 채운 보드를 돌려준다 */
export function fillCandidateNotes(board: Board): Cell[] {
  return board.map((c, i) => (valueOf(c) ? c : { ...c, notes: candidateMask(board, i) }));
}

/** 노트 입력이 적용되는 칸: 제시 숫자도, 답도 없는 칸 */
export function noteTargets(board: Board, selection: Iterable<number>): number[] {
  return [...new Set(selection)].filter((i) => valueOf(board[i]!) === 0);
}

/** 대상 칸 모두에 해당 숫자 노트가 있는지 (대상이 없으면 false) */
export function allHaveNote(board: Board, selection: Iterable<number>, digit: number): boolean {
  const targets = noteTargets(board, selection);
  return targets.length > 0 && targets.every((i) => hasNote(board[i]!, digit));
}

/**
 * 노트 토글.
 * 답이 있는 칸을 제외한 대상 칸 모두에 숫자 노트가 있으면 모두 제거,
 * 그렇지 않으면 모두에 추가한다.
 */
export function toggleNote(board: Board, selection: Iterable<number>, digit: number): Change[] {
  const targets = noteTargets(board, selection);
  if (targets.length === 0) return [];
  const bit = 1 << digit;
  const remove = targets.every((i) => hasNote(board[i]!, digit));
  const changes: Change[] = [];
  for (const i of targets) {
    const c = board[i]!;
    const ch = change(board, i, { ...c, notes: remove ? c.notes & ~bit : c.notes | bit });
    if (ch) changes.push(ch);
  }
  return changes;
}

/**
 * 답 입력. 제시 숫자 칸은 무시한다.
 * 해당 칸의 노트는 지우고, autoRemoveNotes 가 켜져 있으면
 * 같은 행/열/박스의 같은 숫자 노트도 함께 지운다.
 */
export function setAnswer(
  board: Board,
  index: number,
  digit: number,
  autoRemoveNotes = true,
): Change[] {
  const c = board[index]!;
  if (c.given) return [];
  if (c.answer === digit) return [];
  const changes: Change[] = [];
  const self = change(board, index, { ...c, answer: digit, notes: 0 });
  if (self) changes.push(self);
  if (autoRemoveNotes) {
    const bit = 1 << digit;
    for (const p of PEERS[index]!) {
      const pc = board[p]!;
      if (pc.notes & bit) {
        const ch = change(board, p, { ...pc, notes: pc.notes & ~bit });
        if (ch) changes.push(ch);
      }
    }
  }
  return changes;
}

/** 선택된 모든 칸의 답과 노트를 지운다. 제시 숫자 칸은 무시. */
export function erase(board: Board, selection: Iterable<number>): Change[] {
  const changes: Change[] = [];
  for (const i of new Set(selection)) {
    const c = board[i]!;
    if (c.given) continue;
    const ch = change(board, i, { ...c, answer: 0, notes: 0 });
    if (ch) changes.push(ch);
  }
  return changes;
}

export function canErase(board: Board, selection: Iterable<number>): boolean {
  for (const i of selection) {
    const c = board[i]!;
    if (!c.given && (c.answer || c.notes)) return true;
  }
  return false;
}

export function applyChanges(board: Board, changes: readonly Change[], dir: 'forward' | 'backward' = 'forward'): Cell[] {
  const next = board.slice();
  const list = dir === 'forward' ? changes : [...changes].reverse();
  for (const ch of list) next[ch.index] = dir === 'forward' ? ch.after : ch.before;
  return next;
}

/** 같은 행/열/박스에 같은 숫자가 있는 칸들 */
export function findConflicts(board: Board): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < CELL_COUNT; i++) {
    const v = valueOf(board[i]!);
    if (!v) continue;
    for (const p of PEERS[i]!) {
      if (valueOf(board[p]!) === v) {
        out.add(i);
        break;
      }
    }
  }
  return out;
}

/** 정답과 다른 사용자 답이 들어간 칸들 */
export function findMistakes(board: Board, solution: readonly number[]): Set<number> {
  const out = new Set<number>();
  board.forEach((c, i) => {
    if (c.answer && c.answer !== solution[i]) out.add(i);
  });
  return out;
}

export function isSolved(board: Board, solution: readonly number[]): boolean {
  return board.every((c, i) => valueOf(c) === solution[i]);
}

/** 숫자별로 보드에 배치된 개수 (index 1..9) */
export function digitCounts(board: Board): number[] {
  const counts = new Array<number>(SIZE + 1).fill(0);
  for (const c of board) {
    const v = valueOf(c);
    if (v) counts[v]!++;
  }
  return counts;
}
