import { describe, expect, it } from 'vitest';
import { NonUniqueError, parseResponse } from '../src/api';

// 유효한 정답 (행 이동 패턴)
const SOLUTION = Array.from({ length: 9 }, (_, r) =>
  Array.from({ length: 9 }, (_, c) => ((r * 3 + Math.floor(r / 3) + c) % 9) + 1),
);
const PUZZLE = SOLUTION.map((row, r) => row.map((v, c) => ((r + c) % 2 ? null : v)));

describe('parseResponse', () => {
  it('API Ninjas 응답을 81칸 배열로 바꾸고 빈칸(null)을 0 으로 둔다', () => {
    const p = parseResponse({ puzzle: PUZZLE, solution: SOLUTION }, 'Hard');
    expect(p.value).toHaveLength(81);
    expect(p.value[1]).toBe(0);
    expect(p.value[0]).toBe(SOLUTION[0]![0]);
    expect(p.solution).toEqual(SOLUTION.flat());
    expect(p.difficulty).toBe('Hard');
    expect(p.id).toBe(p.value.join(''));
  });

  it('형식이 맞지 않으면 거부한다', () => {
    expect(() => parseResponse({ error: 'x' }, 'Easy')).toThrow();
    expect(() => parseResponse({ puzzle: PUZZLE, solution: SOLUTION.slice(1) }, 'Easy')).toThrow();
  });

  it('규칙에 맞지 않는 정답은 거부한다', () => {
    const bad = SOLUTION.map((row) => [...row]);
    [bad[0]![0], bad[0]![1]] = [bad[0]![1]!, bad[0]![0]!];
    expect(() => parseResponse({ puzzle: PUZZLE.map(() => Array(9).fill(null)), solution: bad }, 'Easy')).toThrow();
  });

  it('해가 여러 개인 문제는 NonUniqueError 로 거부한다', () => {
    const empty = SOLUTION.map(() => Array(9).fill(null));
    expect(() => parseResponse({ puzzle: empty, solution: SOLUTION }, 'Easy')).toThrow(NonUniqueError);
  });

  it('제시 숫자가 정답과 다르면 거부한다', () => {
    const wrong = PUZZLE.map((row) => [...row]);
    wrong[0]![0] = (SOLUTION[0]![0]! % 9) + 1;
    expect(() => parseResponse({ puzzle: wrong, solution: SOLUTION }, 'Easy')).toThrow();
  });
});
