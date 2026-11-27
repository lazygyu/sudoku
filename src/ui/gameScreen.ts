import { difficultyLabel, type Puzzle } from '../api';
import { History } from '../history';
import {
  allHaveNote,
  applyChanges,
  canErase,
  createBoard,
  diffBoards,
  digitCounts,
  erase,
  fillCandidateNotes,
  findConflicts,
  findMistakes,
  isSolved,
  noteTargets,
  setAnswer,
  SIZE,
  toggleNote,
  type Cell,
  type Change,
} from '../model';
import { clearGame, loadSolved, markSolved, saveGame, saveSettings, type SavedGame, type Settings } from '../storage';
import { formatTime, Timer } from '../timer';
import { BoardView } from './board';
import { h, vibrate } from './dom';
import { attachRadial, RadialSession, type RadialMenuOptions } from './radial';

const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
  redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/></svg>',
  erase:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20H9L4 15a2 2 0 010-3l8-8a2 2 0 013 0l5 5a2 2 0 010 3l-8 8"/><path d="M8.5 9.5l6 6"/></svg>',
  snapshot:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z"/><path d="M12 7.5v6M9 10.5h6"/></svg>',
  restore:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 102.5-6"/><path d="M3 3v5h5"/><path d="M12 8v4l3 2"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
};

function iconButton(icon: string, label: string, cls = ''): HTMLButtonElement {
  const b = h('button', { class: `icon-btn ${cls}`, type: 'button', 'aria-label': label, title: label });
  b.innerHTML = icon;
  return b;
}

export interface GameScreenOptions {
  saved: SavedGame | null;
  puzzle: Puzzle;
  settings: Settings;
  onExit: () => void;
}

export class GameScreen {
  readonly el: HTMLDivElement;
  private readonly puzzle: Puzzle;
  private cells: Cell[];
  private readonly history: History;
  private readonly timer: Timer;
  private readonly settings: Settings;
  private selection = new Set<number>();
  private solved = false;
  /** 사용자가 찍어둔 보드 상태. 복원은 히스토리 한 단계로 쌓여 undo 가능하다. */
  private snapshot: Cell[] | null = null;

  private readonly board: BoardView;
  private readonly timeEl: HTMLSpanElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly eraseBtn: HTMLButtonElement;
  private readonly snapshotBtn: HTMLButtonElement;
  private readonly restoreBtn: HTMLButtonElement;
  private readonly toastEl: HTMLDivElement;
  private toastHandle = 0;
  private readonly noteBtn: HTMLButtonElement;
  private readonly answerBtn: HTMLButtonElement;
  private readonly settingsPanel: HTMLDivElement;
  private readonly mistakeToggle: HTMLInputElement;
  private readonly boardWrap: HTMLDivElement;

  private tickHandle = 0;
  private lastSavedSecond = -1;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly opts: GameScreenOptions) {
    const { saved, puzzle } = opts;
    this.puzzle = puzzle;
    this.settings = opts.settings;
    if (saved && saved.puzzle.id === puzzle.id) {
      this.cells = saved.cells;
      this.history = new History(saved.history);
      this.timer = new Timer(saved.elapsedMs);
      this.snapshot = saved.snapshot?.length === 81 ? saved.snapshot : null;
    } else {
      const fresh = createBoard(puzzle.value);
      // 시작 상태이므로 히스토리에 넣지 않는다 (undo 로 사라지지 않음)
      this.cells = this.settings.autoFillNotes ? fillCandidateNotes(fresh) : fresh;
      this.history = new History();
      this.timer = new Timer(0);
    }

    // 상단 바
    const backBtn = iconButton(ICON.back, '목록으로');
    backBtn.addEventListener('click', () => this.exit());
    this.timeEl = h('span', { class: 'timer', text: '0:00' });
    const settingsBtn = iconButton(ICON.settings, '설정');
    this.mistakeToggle = h('input', { type: 'checkbox' });
    this.mistakeToggle.checked = this.settings.showMistakes;
    this.mistakeToggle.addEventListener('change', () => {
      this.settings.showMistakes = this.mistakeToggle.checked;
      saveSettings(this.settings);
      this.render();
    });
    this.settingsPanel = h(
      'div',
      { class: 'settings-panel', hidden: true },
      h('label', { class: 'switch' }, this.mistakeToggle, h('span', { text: '오답 즉시 표시' })),
    );
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.settingsPanel.hidden = !this.settingsPanel.hidden;
    });
    const top = h(
      'header',
      { class: 'topbar' },
      backBtn,
      h(
        'div',
        { class: 'topbar-center' },
        h('span', { class: `badge badge-${puzzle.difficulty.toLowerCase()}`, text: difficultyLabel(puzzle.difficulty) }),
        this.timeEl,
      ),
      settingsBtn,
      this.settingsPanel,
    );

    // 보드
    this.board = new BoardView(
      (sel) => {
        this.selection = sel;
        this.render();
      },
      // 선택된 한 칸을 길게 누르면 그 칸 주위에 답 입력 링을 띄운다
      (_idx, center, pointer) => {
        if (!this.canAnswer()) return null;
        vibrate(15);
        return new RadialSession(this.answerRadial, center, pointer);
      },
    );
    this.boardWrap = h('div', { class: 'board-wrap' }, this.board.el);

    // 하단 컨트롤
    this.undoBtn = iconButton(ICON.undo, '실행 취소');
    this.redoBtn = iconButton(ICON.redo, '다시 실행');
    this.eraseBtn = iconButton(ICON.erase, '지우기', 'erase');
    this.undoBtn.addEventListener('click', () => this.undo());
    this.redoBtn.addEventListener('click', () => this.redo());
    this.eraseBtn.addEventListener('click', () => this.eraseSelection());
    this.snapshotBtn = iconButton(ICON.snapshot, '스냅샷 저장');
    this.restoreBtn = iconButton(ICON.restore, '스냅샷으로 되돌리기', 'restore');
    this.snapshotBtn.addEventListener('click', () => this.takeSnapshot());
    this.restoreBtn.addEventListener('click', () => this.restoreSnapshot());
    this.toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });

    this.noteBtn = h('button', { class: 'big-btn note-btn', type: 'button' }, h('span', { class: 'big-icon', text: '✎' }), h('span', { text: '노트' }));
    this.answerBtn = h('button', { class: 'big-btn answer-btn', type: 'button' }, h('span', { class: 'big-icon', text: '#' }), h('span', { text: '답' }));

    attachRadial(this.noteBtn, {
      kind: 'note',
      isEnabled: () => this.canNote(),
      digitState: (d) => ({ active: allHaveNote(this.cells, this.selection, d) }),
      onPick: (d) => this.note(d),
    });
    attachRadial(this.answerBtn, { ...this.answerRadial, isEnabled: () => this.canAnswer() });

    const controls = h(
      'footer',
      { class: 'controls' },
      h(
        'div',
        { class: 'tool-row' },
        h('div', { class: 'tool-group' }, this.undoBtn, this.redoBtn),
        h('div', { class: 'tool-group' }, this.snapshotBtn, this.restoreBtn),
        this.eraseBtn,
      ),
      h('div', { class: 'main-row' }, this.noteBtn, this.answerBtn),
    );

    this.el = h('div', { class: 'screen game-screen' }, top, this.boardWrap, controls, this.toastEl);
    // 보드와 버튼, 설정 패널 바깥의 빈 곳을 누르면 선택 해제
    this.el.addEventListener('pointerdown', (e) => {
      const t = e.target as Element;
      if (t.closest('.board, button, label, input, .settings-panel, .complete-overlay')) return;
      if (this.selection.size === 0) return;
      this.selection = new Set();
      this.render();
    });

    this.bindGlobal();
    this.fitBoard();
    this.solved = isSolved(this.cells, puzzle.solution);
    this.render();
    if (!this.solved) {
      this.save();
      this.resume();
    } else this.showComplete();
  }

  /** 답 입력 링 설정 (답 버튼과 칸 길게 누르기에서 공용) */
  private readonly answerRadial: RadialMenuOptions = {
    kind: 'answer',
    digitState: (d) => {
      const idx = this.singleIndex();
      return { active: idx !== null && this.cells[idx]!.answer === d, done: digitCounts(this.cells)[d]! >= SIZE };
    },
    onPick: (d) => this.answer(d),
  };

  // ---- 상태 헬퍼 ----

  private singleIndex(): number | null {
    return this.selection.size === 1 ? [...this.selection][0]! : null;
  }

  private canNote(): boolean {
    return !this.solved && noteTargets(this.cells, this.selection).length > 0;
  }

  private canAnswer(): boolean {
    const idx = this.singleIndex();
    return !this.solved && idx !== null && !this.cells[idx]!.given;
  }

  // ---- 동작 ----

  private commit(changes: Change[]): void {
    if (this.solved || changes.length === 0) return;
    this.history.push(changes);
    this.cells = applyChanges(this.cells, changes);
    this.afterChange();
  }

  private afterChange(): void {
    this.save();
    this.render();
    if (!this.solved && isSolved(this.cells, this.puzzle.solution)) {
      this.solved = true;
      this.timer.pause();
      markSolved(this.puzzle.id, this.timer.elapsedMs);
      clearGame();
      this.render();
      this.showComplete();
    }
  }

  note(d: number): void {
    this.commit(toggleNote(this.cells, this.selection, d));
  }

  answer(d: number): void {
    const idx = this.singleIndex();
    if (idx === null || !this.canAnswer()) return;
    this.commit(setAnswer(this.cells, idx, d));
  }

  eraseSelection(): void {
    this.commit(erase(this.cells, this.selection));
  }

  undo(): void {
    if (this.solved) return;
    const step = this.history.undo();
    if (!step) return;
    this.cells = applyChanges(this.cells, step, 'backward');
    this.afterChange();
  }

  redo(): void {
    if (this.solved) return;
    const step = this.history.redo();
    if (!step) return;
    this.cells = applyChanges(this.cells, step, 'forward');
    this.afterChange();
  }

  takeSnapshot(): void {
    if (this.solved) return;
    const replaced = this.snapshot !== null;
    this.snapshot = this.cells.slice();
    vibrate(10);
    this.save();
    this.render();
    this.toast(replaced ? '스냅샷을 새로 저장했어요' : '스냅샷을 저장했어요');
  }

  /** 스냅샷 상태로 되돌린다. 히스토리에 한 단계로 쌓이므로 실행 취소로 되돌릴 수 있다. */
  restoreSnapshot(): void {
    if (this.solved || !this.snapshot) return;
    const changes = diffBoards(this.cells, this.snapshot);
    if (changes.length === 0) return;
    this.commit(changes);
    if (!this.solved) this.toast('스냅샷으로 되돌렸어요');
  }

  private toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastHandle);
    this.toastHandle = window.setTimeout(() => this.toastEl.classList.remove('show'), 1600);
  }

  // ---- 렌더링 ----

  private render(): void {
    const conflicts = findConflicts(this.cells);
    const mistakes = this.settings.showMistakes ? findMistakes(this.cells, this.puzzle.solution) : new Set<number>();
    this.board.render({ cells: this.cells, selection: this.selection, conflicts, mistakes });
    this.board.el.classList.toggle('solved', this.solved);

    this.undoBtn.disabled = this.solved || !this.history.canUndo;
    this.redoBtn.disabled = this.solved || !this.history.canRedo;
    this.eraseBtn.disabled = this.solved || !canErase(this.cells, this.selection);
    this.snapshotBtn.disabled = this.solved;
    this.restoreBtn.disabled =
      this.solved || !this.snapshot || diffBoards(this.cells, this.snapshot).length === 0;
    this.restoreBtn.classList.toggle('has-snapshot', this.snapshot !== null);
    this.noteBtn.disabled = !this.canNote();
    this.answerBtn.disabled = !this.canAnswer();
    this.updateTime();
  }

  private updateTime(): void {
    this.timeEl.textContent = formatTime(this.timer.elapsedMs);
  }

  /** 보드를 남는 공간에 맞는 정사각형으로 맞춘다 */
  private fitBoard(): void {
    const ro = new ResizeObserver(() => {
      const { width, height } = this.boardWrap.getBoundingClientRect();
      const size = Math.floor(Math.min(width, height, 640));
      this.board.el.style.setProperty('--board-size', `${size}px`);
    });
    ro.observe(this.boardWrap);
    this.cleanups.push(() => ro.disconnect());
  }

  private showComplete(): void {
    const best = loadSolved()[this.puzzle.id];
    const card = h(
      'div',
      { class: 'complete-card' },
      h('div', { class: 'complete-title', text: '완성!' }),
      h('div', { class: 'complete-time', text: formatTime(this.timer.elapsedMs) }),
      best !== undefined && best < this.timer.elapsedMs - 999
        ? h('div', { class: 'complete-best', text: `최고 기록 ${formatTime(best)}` })
        : null,
    );
    const again = h('button', { class: 'primary-btn', type: 'button', text: '새 게임' });
    again.addEventListener('click', () => this.exit());
    const close = h('button', { class: 'text-btn', type: 'button', text: '보드 보기' });
    const overlay = h('div', { class: 'complete-overlay' }, h('div', { class: 'complete-box' }, card, again, close));
    close.addEventListener('click', () => overlay.remove());
    this.el.append(overlay);
  }

  // ---- 타이머/저장 ----

  private resume(): void {
    if (this.solved || document.hidden) return;
    this.timer.start();
    if (!this.tickHandle) {
      this.tickHandle = window.setInterval(() => {
        this.updateTime();
        const sec = Math.floor(this.timer.elapsedMs / 1000);
        if (sec % 5 === 0 && sec !== this.lastSavedSecond) {
          this.lastSavedSecond = sec;
          this.save();
        }
      }, 250);
    }
  }

  private pause(): void {
    this.timer.pause();
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = 0;
    }
    this.updateTime();
    this.save();
  }

  private save(): void {
    if (this.solved) return;
    saveGame({
      puzzle: this.puzzle,
      cells: this.cells,
      history: this.history.toJSON(),
      elapsedMs: this.timer.elapsedMs,
      ...(this.snapshot ? { snapshot: this.snapshot } : {}),
    });
  }

  private exit(): void {
    this.opts.onExit();
  }

  private bindGlobal(): void {
    const onVisibility = () => (document.hidden ? this.pause() : this.resume());
    const onPageHide = () => this.save();
    const onDocPointer = (e: PointerEvent) => {
      if (!this.settingsPanel.hidden && !this.settingsPanel.contains(e.target as Node)) {
        this.settingsPanel.hidden = true;
      }
    };
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('pointerdown', onDocPointer);
    window.addEventListener('keydown', onKey);
    this.cleanups.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('pointerdown', onDocPointer);
      window.removeEventListener('keydown', onKey);
    });
  }

  /** 데스크톱용 키보드 입력: 숫자=답, Shift/Alt+숫자=노트, 방향키 이동, Backspace 지우기 */
  private onKey(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    const digit = /^Digit([1-9])$/.exec(e.code)?.[1];
    if (digit) {
      e.preventDefault();
      const d = Number(digit);
      if (e.shiftKey || e.altKey || this.selection.size > 1) this.note(d);
      else this.answer(d);
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      this.eraseSelection();
      return;
    }
    const move: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const dir = move[e.key];
    if (dir) {
      e.preventDefault();
      const cur = this.singleIndex() ?? [...this.selection].pop() ?? 40;
      const r = (Math.floor(cur / SIZE) + dir[0] + SIZE) % SIZE;
      const c = ((cur % SIZE) + dir[1] + SIZE) % SIZE;
      this.selection = new Set([r * SIZE + c]);
      this.render();
    }
  }

  destroy(): void {
    clearTimeout(this.toastHandle);
    this.pause();
    this.cleanups.forEach((f) => f());
    this.el.remove();
  }
}
