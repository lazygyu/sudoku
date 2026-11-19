import { describe, expect, it } from 'vitest';
import {
  allHaveNote,
  applyChanges,
  canErase,
  createBoard,
  diffBoards,
  erase,
  fillCandidateNotes,
  noteDigits,
  findConflicts,
  findMistakes,
  hasNote,
  isSolved,
  PEERS,
  setAnswer,
  toggleNote,
  type Cell,
} from '../src/model';
import { History } from '../src/history';

const SOLUTION = [
  5, 3, 4, 6, 7, 8, 9, 1, 2,
  6, 7, 2, 1, 9, 5, 3, 4, 8,
  1, 9, 8, 3, 4, 2, 5, 6, 7,
  8, 5, 9, 7, 6, 1, 4, 2, 3,
  4, 2, 6, 8, 5, 3, 7, 9, 1,
  7, 1, 3, 9, 2, 4, 8, 5, 6,
  9, 6, 1, 5, 3, 7, 2, 8, 4,
  2, 8, 7, 4, 1, 9, 6, 3, 5,
  3, 4, 5, 2, 8, 6, 1, 7, 9,
];
// 첫 칸(0)은 제시 숫자 5, 나머지 첫 행은 빈칸
const PUZZLE = SOLUTION.map((v, i) => (i > 0 && i < 9 ? 0 : v));

const apply = (b: Cell[], ch: ReturnType<typeof toggleNote>) => applyChanges(b, ch);

describe('PEERS', () => {
  it('각 칸은 20개의 peer 를 가진다', () => {
    expect(PEERS.every((p) => p.length === 20)).toBe(true);
  });
});

describe('toggleNote', () => {
  it('빈 칸들에 노트를 추가한다', () => {
    const b = apply(createBoard(PUZZLE), toggleNote(createBoard(PUZZLE), [1, 2], 3));
    expect(hasNote(b[1]!, 3)).toBe(true);
    expect(hasNote(b[2]!, 3)).toBe(true);
  });

  it('일부만 노트가 있으면 모두에 추가한다', () => {
    let b = createBoard(PUZZLE);
    b = apply(b, toggleNote(b, [1], 3));
    const ch = toggleNote(b, [1, 2], 3);
    expect(ch).toHaveLength(1); // 이미 있는 칸은 변경 없음
    b = apply(b, ch);
    expect(hasNote(b[1]!, 3) && hasNote(b[2]!, 3)).toBe(true);
  });

  it('모두에 노트가 있으면 모두에서 제거한다', () => {
    let b = createBoard(PUZZLE);
    b = apply(b, toggleNote(b, [1, 2], 3));
    b = apply(b, toggleNote(b, [1, 2], 3));
    expect(hasNote(b[1]!, 3) || hasNote(b[2]!, 3)).toBe(false);
  });

  it('제시 숫자 칸과 답이 있는 칸은 무시하고 판단에서도 제외한다', () => {
    let b = createBoard(PUZZLE);
    b = apply(b, setAnswer(b, 2, 4));
    b = apply(b, toggleNote(b, [1], 7));
    // 대상은 1번 칸뿐이고 이미 노트가 있으므로 제거된다
    expect(allHaveNote(b, [0, 1, 2], 7)).toBe(true);
    b = apply(b, toggleNote(b, [0, 1, 2], 7));
    expect(hasNote(b[1]!, 7)).toBe(false);
    expect(b[0]!.notes).toBe(0);
    expect(b[2]!.notes).toBe(0);
  });

  it('대상이 없으면 아무것도 하지 않는다', () => {
    const b = createBoard(PUZZLE);
    expect(toggleNote(b, [0], 1)).toEqual([]);
  });
});

describe('setAnswer', () => {
  it('제시 숫자 칸은 수정할 수 없다', () => {
    expect(setAnswer(createBoard(PUZZLE), 0, 1)).toEqual([]);
  });

  it('답을 넣으면 자기 노트와 peer 의 같은 숫자 노트를 지운다', () => {
    let b = createBoard(PUZZLE);
    b = apply(b, toggleNote(b, [1, 2, 3], 3));
    b = apply(b, toggleNote(b, [1], 9));
    b = apply(b, setAnswer(b, 1, 3));
    expect(b[1]!.answer).toBe(3);
    expect(b[1]!.notes).toBe(0);
    expect(hasNote(b[2]!, 3)).toBe(false);
    expect(hasNote(b[3]!, 3)).toBe(false);
  });

  it('autoRemoveNotes 를 끄면 peer 노트는 유지한다', () => {
    let b = createBoard(PUZZLE);
    b = apply(b, toggleNote(b, [1, 2], 3));
    b = apply(b, setAnswer(b, 1, 3, false));
    expect(hasNote(b[2]!, 3)).toBe(true);
  });

  it('사용자 답은 다른 답으로 교체할 수 있다', () => {
    let b = createBoard(PUZZLE);
    b = apply(b, setAnswer(b, 1, 3));
    b = apply(b, setAnswer(b, 1, 4));
    expect(b[1]!.answer).toBe(4);
  });
});

describe('erase', () => {
  it('선택된 칸의 답과 노트를 지우고 제시 숫자는 유지한다', () => {
    let b = createBoard(PUZZLE);
    b = apply(b, setAnswer(b, 1, 3));
    b = apply(b, toggleNote(b, [2], 4));
    expect(canErase(b, [0])).toBe(false);
    expect(canErase(b, [0, 1])).toBe(true);
    b = apply(b, erase(b, [0, 1, 2]));
    expect(b[0]!.given).toBe(5);
    expect(b[1]!.answer).toBe(0);
    expect(b[2]!.notes).toBe(0);
  });
});

describe('판정', () => {
  it('충돌과 오답을 찾는다', () => {
    // 0번 칸에만 제시 숫자 5가 있는 보드
    let b = createBoard(SOLUTION.map((v, i) => (i === 0 ? v : 0)));
    b = apply(b, setAnswer(b, 1, 5)); // 0번 칸 5와 충돌
    expect(findConflicts(b)).toEqual(new Set([0, 1]));
    b = apply(b, setAnswer(b, 1, 4)); // 충돌은 없지만 오답 (정답 3)
    expect(findConflicts(b).size).toBe(0);
    expect(findMistakes(b, SOLUTION)).toEqual(new Set([1]));
  });

  it('완성 여부를 판정한다', () => {
    let b = createBoard(PUZZLE);
    expect(isSolved(b, SOLUTION)).toBe(false);
    for (let i = 1; i < 9; i++) b = apply(b, setAnswer(b, i, SOLUTION[i]!));
    expect(isSolved(b, SOLUTION)).toBe(true);
  });
});

describe('fillCandidateNotes', () => {
  it('빈 칸마다 행/열/박스에 없는 숫자만 노트로 채운다', () => {
    const b = fillCandidateNotes(createBoard(PUZZLE));
    // 0번 칸은 제시 숫자이므로 노트 없음
    expect(b[0]!.notes).toBe(0);
    // 1번 칸: 정답 3 이 후보에 반드시 포함되고, 같은 행의 5 와 같은 열/박스의 숫자는 제외
    expect(noteDigits(b[1]!)).toEqual([3]);
    // 첫 행 빈칸들은 모두 자기 정답을 후보로 가진다
    for (let i = 1; i < 9; i++) expect(hasNote(b[i]!, SOLUTION[i]!)).toBe(true);
  });

  it('빈 보드면 모든 칸에 1~9 노트가 생긴다', () => {
    const b = fillCandidateNotes(createBoard(new Array(81).fill(0)));
    expect(b.every((c) => noteDigits(c).length === 9)).toBe(true);
  });
});

describe('History', () => {
  it('한 동작을 한 단계로 되돌리고 다시 실행한다', () => {
    const h = new History();
    let b = createBoard(PUZZLE);
    const s1 = toggleNote(b, [1, 2, 3], 3);
    h.push(s1);
    b = applyChanges(b, s1);
    const s2 = setAnswer(b, 1, 3); // 노트 자동 제거 포함
    h.push(s2);
    b = applyChanges(b, s2);

    b = applyChanges(b, h.undo()!, 'backward');
    expect(b[1]!.answer).toBe(0);
    expect(hasNote(b[1]!, 3) && hasNote(b[2]!, 3) && hasNote(b[3]!, 3)).toBe(true);

    b = applyChanges(b, h.redo()!, 'forward');
    expect(b[1]!.answer).toBe(3);
    expect(hasNote(b[2]!, 3)).toBe(false);
  });

  it('새 동작이 들어오면 redo 스택을 비운다', () => {
    const h = new History();
    const b = createBoard(PUZZLE);
    h.push(toggleNote(b, [1], 1));
    h.undo();
    expect(h.canRedo).toBe(true);
    h.push(toggleNote(b, [1], 2));
    expect(h.canRedo).toBe(false);
  });

  it('빈 단계는 쌓지 않는다', () => {
    const h = new History();
    h.push([]);
    expect(h.canUndo).toBe(false);
  });
});

describe('diffBoards', () => {
  it('변경 목록을 적용하면 대상 보드가 되고, 되돌리면 원래 보드가 된다', () => {
    const start = createBoard(new Array(81).fill(0));
    const snap = applyChanges(start, setAnswer(start, 0, 5));
    const later = applyChanges(snap, [...setAnswer(snap, 1, 3), ...toggleNote(snap, [2], 7)]);
    const changes = diffBoards(later, snap);
    expect(changes.map((c) => c.index).sort()).toEqual([1, 2]);
    expect(applyChanges(later, changes)).toEqual(snap);
    expect(applyChanges(applyChanges(later, changes), changes, 'backward')).toEqual(later);
  });

  it('같은 보드면 빈 목록', () => {
    const b = createBoard(new Array(81).fill(0));
    expect(diffBoards(b, b.slice())).toEqual([]);
  });
});
