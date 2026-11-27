import { boxOf, CELL_COUNT, colOf, hasNote, rowOf, SIZE, valueOf, type Board } from '../model';
import { h } from './dom';

/** 길게 누르기로 시작된 동작이 이후 포인터 이동/해제를 넘겨받는 인터페이스 */
export interface HoldHandler {
  move(x: number, y: number): void;
  end(x: number, y: number): void;
  close(): void;
}

/** 한 칸을 이 시간(ms) 이상 움직이지 않고 누르고 있으면 hold 로 본다 */
const HOLD_MS = 320;

export interface BoardRenderState {
  cells: Board;
  selection: ReadonlySet<number>;
  conflicts: ReadonlySet<number>;
  mistakes: ReadonlySet<number>;
}

/**
 * 9x9 보드. 탭하면 한 칸 선택, 드래그하면 지나간 칸을 모두 선택한다.
 */
export class BoardView {
  readonly el: HTMLDivElement;
  private readonly cellEls: HTMLDivElement[] = [];
  private readonly valueEls: HTMLSpanElement[] = [];
  private readonly noteEls: HTMLSpanElement[][] = [];
  private readonly cache: string[] = new Array<string>(CELL_COUNT).fill('');

  private dragPointer: number | null = null;
  private dragSelection = new Set<number>();
  private lastPoint: { x: number; y: number } | null = null;
  private holdTimer = 0;
  private hold: HoldHandler | null = null;

  constructor(
    private readonly onSelect: (sel: Set<number>) => void,
    /** 한 칸을 길게 눌렀을 때 (그 칸이 선택된 뒤 호출됨). 동작을 시작하지 않으려면 null 을 돌려준다. */
    private readonly onHold?: (index: number, cellCenter: { x: number; y: number }, pointer: { x: number; y: number }) => HoldHandler | null,
  ) {
    this.el = h('div', { class: 'board', role: 'grid', 'aria-label': '스도쿠 보드' });
    for (let i = 0; i < CELL_COUNT; i++) {
      const value = h('span', { class: 'value' });
      const notes = h('div', { class: 'notes' });
      const noteSpans: HTMLSpanElement[] = [];
      for (let d = 1; d <= SIZE; d++) {
        const s = h('span', { 'data-d': d });
        noteSpans.push(s);
        notes.append(s);
      }
      const cell = h('div', { class: this.baseClass(i), role: 'gridcell' }, value, notes);
      this.cellEls.push(cell);
      this.valueEls.push(value);
      this.noteEls.push(noteSpans);
      this.el.append(cell);
    }
    this.bindPointer();
  }

  private indexAt(x: number, y: number): number | null {
    const rect = this.el.getBoundingClientRect();
    const rx = x - rect.left;
    const ry = y - rect.top;
    if (rx < 0 || ry < 0 || rx >= rect.width || ry >= rect.height) return null;
    const c = Math.min(SIZE - 1, Math.floor((rx / rect.width) * SIZE));
    const r = Math.min(SIZE - 1, Math.floor((ry / rect.height) * SIZE));
    return r * SIZE + c;
  }

  /** 빠르게 드래그해도 칸이 빠지지 않도록 직전 위치와의 사이를 보간한다 */
  private addAlong(x: number, y: number): boolean {
    const from = this.lastPoint ?? { x, y };
    const cellSize = this.el.getBoundingClientRect().width / SIZE;
    const dist = Math.hypot(x - from.x, y - from.y);
    const steps = Math.max(1, Math.ceil(dist / (cellSize / 4)));
    let changed = false;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const idx = this.indexAt(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
      if (idx !== null && !this.dragSelection.has(idx)) {
        this.dragSelection.add(idx);
        changed = true;
      }
    }
    this.lastPoint = { x, y };
    return changed;
  }

  private cellCenter(i: number): { x: number; y: number } {
    const rect = this.el.getBoundingClientRect();
    const cs = rect.width / SIZE;
    return { x: rect.left + (colOf(i) + 0.5) * cs, y: rect.top + (rowOf(i) + 0.5) * cs };
  }

  private cancelHoldTimer(): void {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = 0;
    }
  }

  private bindPointer(): void {
    this.el.addEventListener('pointerdown', (e) => {
      if (this.dragPointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const idx = this.indexAt(e.clientX, e.clientY);
      if (idx === null) return;
      e.preventDefault();
      this.dragPointer = e.pointerId;
      this.el.setPointerCapture(e.pointerId);
      this.dragSelection = new Set([idx]);
      this.lastPoint = { x: e.clientX, y: e.clientY };
      this.onSelect(new Set(this.dragSelection));

      if (this.onHold) {
        const pointer = { x: e.clientX, y: e.clientY };
        this.holdTimer = window.setTimeout(() => {
          this.holdTimer = 0;
          if (this.dragPointer === null) return;
          this.hold = this.onHold!(idx, this.cellCenter(idx), this.lastPoint ?? pointer);
        }, HOLD_MS);
      }
    });

    this.el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.dragPointer) return;
      if (this.hold) {
        this.hold.move(e.clientX, e.clientY);
        return;
      }
      // 길게 누르기 대기 중: 같은 칸 안에서의 작은 흔들림은 무시, 다른 칸으로 가면 드래그 선택으로 전환
      if (this.holdTimer) {
        const idx = this.indexAt(e.clientX, e.clientY);
        if (idx !== null && this.dragSelection.has(idx)) {
          this.lastPoint = { x: e.clientX, y: e.clientY };
          return;
        }
        this.cancelHoldTimer();
      }
      const events = e.getCoalescedEvents?.() ?? [e];
      let changed = false;
      for (const ev of events.length ? events : [e]) {
        changed = this.addAlong(ev.clientX, ev.clientY) || changed;
      }
      if (changed) this.onSelect(new Set(this.dragSelection));
    });

    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.dragPointer) return;
      this.dragPointer = null;
      this.lastPoint = null;
      this.cancelHoldTimer();
      const hold = this.hold;
      this.hold = null;
      if (hold) {
        if (e.type === 'pointerup') hold.end(e.clientX, e.clientY);
        else hold.close();
      }
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  render(state: BoardRenderState): void {
    const { cells, selection, conflicts, mistakes } = state;
    const single = selection.size === 1 ? [...selection][0]! : null;
    const focusValue = single !== null ? valueOf(cells[single]!) : 0;

    for (let i = 0; i < CELL_COUNT; i++) {
      const c = cells[i]!;
      const v = valueOf(c);
      const cls: string[] = [];
      if (c.given) cls.push('given');
      else if (c.answer) cls.push('answer');
      if (selection.has(i)) cls.push('selected');
      if (
        single !== null &&
        i !== single &&
        (rowOf(i) === rowOf(single) || colOf(i) === colOf(single) || boxOf(i) === boxOf(single))
      ) {
        cls.push('peer');
      }
      if (focusValue && v === focusValue) cls.push('same');
      // 선택한 칸의 숫자가 노트로 들어 있는 빈칸
      if (focusValue && !v && hasNote(c, focusValue)) cls.push('note-hit');
      if (conflicts.has(i)) cls.push('conflict');
      if (mistakes.has(i)) cls.push('mistake');

      const noteMask = v ? 0 : c.notes;
      const key = `${cls.join(' ')}|${v}|${noteMask}|${focusValue}`;
      if (this.cache[i] === key) continue;
      this.cache[i] = key;

      const el = this.cellEls[i]!;
      el.className = this.baseClass(i) + (cls.length ? ' ' + cls.join(' ') : '');
      this.valueEls[i]!.textContent = v ? String(v) : '';
      const spans = this.noteEls[i]!;
      for (let d = 1; d <= SIZE; d++) {
        const on = !v && hasNote(c, d);
        const span = spans[d - 1]!;
        span.textContent = on ? String(d) : '';
        span.classList.toggle('hit', on && d === focusValue);
      }
      el.setAttribute(
        'aria-label',
        `${rowOf(i) + 1}행 ${colOf(i) + 1}열 ${v ? v : '빈칸'}${c.given ? ' (제시)' : ''}`,
      );
    }
  }

  private baseClass(i: number): string {
    const r = rowOf(i);
    const c = colOf(i);
    let s = 'cell';
    if (c % 3 === 2 && c !== SIZE - 1) s += ' edge-r';
    if (r % 3 === 2 && r !== SIZE - 1) s += ' edge-b';
    return s;
  }
}
