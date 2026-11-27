import { describe, expect, it } from 'vitest';
import { countSolutions, hasUniqueSolution } from '../src/solver';

const parse = (s: string): number[] => [...s].map((ch) => (ch === '.' ? 0 : Number(ch)));

// 가장 어려운 문제로 알려진 Arto Inkala 의 문제 (해 1개)
const INKALA = '8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..';
// 17칸 제시 문제 (해 1개)
const SEVENTEEN = '000000010400000000020000000000050407008000300001090000300400200050100000000806000';

describe('countSolutions', () => {
  it('유일해 문제는 해가 1개', () => {
    expect(countSolutions(parse(INKALA))).toBe(1);
    expect(countSolutions(parse(SEVENTEEN))).toBe(1);
    expect(hasUniqueSolution(parse(INKALA))).toBe(true);
  });

  it('제시 숫자를 빼면 해가 여러 개가 된다', () => {
    const p = parse(INKALA);
    p[0] = 0;
    expect(countSolutions(p)).toBe(2);
    expect(hasUniqueSolution(p)).toBe(false);
  });

  it('빈 판은 해가 여러 개, limit 까지만 센다', () => {
    expect(countSolutions(new Array(81).fill(0), 5)).toBe(5);
  });

  it('제시 숫자끼리 충돌하면 0', () => {
    const p = new Array(81).fill(0);
    p[0] = 5;
    p[1] = 5;
    expect(countSolutions(p)).toBe(0);
  });
});
