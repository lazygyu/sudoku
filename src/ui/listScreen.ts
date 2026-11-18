import { difficultyLabel, difficultyRank, fetchPuzzles, type Puzzle } from '../api';
import { CELL_COUNT, valueOf, type Cell } from '../model';
import { loadPuzzleList, loadSolved, savePuzzleList, saveSettings, type SavedGame, type Settings } from '../storage';
import { formatTime } from '../timer';
import { h } from './dom';

export interface ListScreenOptions {
  saved: SavedGame | null;
  settings: Settings;
  onPick: (puzzle: Puzzle) => void;
  onContinue: (saved: SavedGame) => void;
}

type Filter = 'all' | 'Easy' | 'Medium' | 'Hard';

/** 문제 숫자만 그리는 작은 미리보기 보드 */
function miniBoard(values: readonly number[], user?: readonly Cell[]): HTMLDivElement {
  const el = h('div', { class: 'mini-board', 'aria-hidden': 'true' });
  for (let i = 0; i < CELL_COUNT; i++) {
    const v = values[i]!;
    const u = user ? valueOf(user[i]!) : 0;
    const cls = v ? 'g' : u ? 'u' : '';
    el.append(h('span', { class: cls, text: v || u || '' }));
  }
  return el;
}

// 화면을 다시 열어도 유지되는 세션 상태
let puzzles: Puzzle[] = loadPuzzleList();
let filter: Filter = 'all';

export class ListScreen {
  readonly el: HTMLDivElement;
  private readonly listEl: HTMLDivElement;
  private readonly filterEl: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;
  private readonly moreBtn: HTMLButtonElement;
  private loading = false;
  private error: string | null = null;
  private destroyed = false;

  constructor(private readonly opts: ListScreenOptions) {
    const header = h('header', { class: 'list-header' }, h('h1', { text: '스도쿠' }));

    const sections: HTMLElement[] = [header];
    const saved = opts.saved;
    if (saved) {
      const cont = h(
        'button',
        { class: 'continue-card', type: 'button' },
        miniBoard(saved.puzzle.value, saved.cells),
        h(
          'div',
          { class: 'continue-info' },
          h('div', { class: 'continue-title', text: '이어하기' }),
          h(
            'div',
            { class: 'continue-meta' },
            h('span', {
              class: `badge badge-${saved.puzzle.difficulty.toLowerCase()}`,
              text: difficultyLabel(saved.puzzle.difficulty),
            }),
            h('span', { text: formatTime(saved.elapsedMs) }),
          ),
        ),
      );
      cont.addEventListener('click', () => opts.onContinue(saved));
      sections.push(cont);
    }

    this.filterEl = h('div', { class: 'filters', role: 'tablist' });
    this.listEl = h('div', { class: 'puzzle-list' });
    this.statusEl = h('div', { class: 'list-status' });
    this.moreBtn = h('button', { class: 'secondary-btn', type: 'button', text: '문제 더 불러오기' });
    this.moreBtn.addEventListener('click', () => void this.load());

    const autoFill = h('input', { type: 'checkbox' });
    autoFill.checked = opts.settings.autoFillNotes;
    autoFill.addEventListener('change', () => {
      opts.settings.autoFillNotes = autoFill.checked;
      saveSettings(opts.settings);
    });

    sections.push(
      h('div', { class: 'section-title', text: '새 문제' }),
      h(
        'label',
        { class: 'switch option-row' },
        autoFill,
        h(
          'span',
          {},
          h('span', { text: '시작할 때 노트 채우기' }),
          h('span', { class: 'option-desc', text: '제시된 숫자를 기준으로 가능한 후보를 모든 빈칸에 노트로 넣습니다' }),
        ),
      ),
      this.filterEl,
      this.listEl,
      this.statusEl,
      h('div', { class: 'more-row' }, this.moreBtn),
    );
    this.el = h('div', { class: 'screen list-screen' }, ...sections);

    this.render();
    if (puzzles.length === 0) void this.load();
  }

  private async load(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.error = null;
    this.render();
    try {
      // 이 API 는 가끔 타임아웃이 나므로 한 번은 자동으로 다시 시도한다
      const fresh = await fetchPuzzles().catch(() => fetchPuzzles());
      const known = new Set(puzzles.map((p) => p.id));
      puzzles = [...puzzles, ...fresh.filter((p) => !known.has(p.id))];
      savePuzzleList(puzzles);
    } catch (e) {
      this.error = (e as Error).message || '문제를 불러오지 못했습니다';
    } finally {
      this.loading = false;
      if (!this.destroyed) this.render();
    }
  }

  private render(): void {
    const solved = loadSolved();
    const counts: Record<Filter, number> = { all: puzzles.length, Easy: 0, Medium: 0, Hard: 0 };
    for (const p of puzzles) if (p.difficulty in counts) counts[p.difficulty as Filter]++;

    this.filterEl.replaceChildren(
      ...(['all', 'Easy', 'Medium', 'Hard'] as Filter[]).map((f) => {
        const b = h(
          'button',
          { class: `chip${filter === f ? ' on' : ''}`, type: 'button', role: 'tab', 'aria-selected': filter === f },
          h('span', { text: f === 'all' ? '전체' : difficultyLabel(f) }),
          h('span', { class: 'chip-count', text: counts[f] }),
        );
        b.addEventListener('click', () => {
          filter = f;
          this.render();
        });
        return b;
      }),
    );

    const shown = puzzles
      .map((p, order) => ({ p, order }))
      .filter(({ p }) => filter === 'all' || p.difficulty === filter)
      // 안 푼 문제를 먼저, 그다음 받아온 순서의 역순(최신 먼저)
      .sort((a, b) => Number(a.p.id in solved) - Number(b.p.id in solved) || b.order - a.order);

    this.listEl.replaceChildren(
      ...shown.map(({ p }) => {
        const given = p.value.filter(Boolean).length;
        const done = solved[p.id];
        const card = h(
          'button',
          { class: `puzzle-card${done !== undefined ? ' done' : ''}`, type: 'button' },
          miniBoard(p.value),
          h(
            'div',
            { class: 'puzzle-meta' },
            h('span', { class: `badge badge-${p.difficulty.toLowerCase()}`, text: difficultyLabel(p.difficulty) }),
            h('span', { class: 'given-count', text: done !== undefined ? `✓ ${formatTime(done)}` : `${given}칸 제시` }),
          ),
        );
        card.style.setProperty('--rank', String(difficultyRank(p.difficulty)));
        card.addEventListener('click', () => this.opts.onPick(p));
        return card;
      }),
    );

    if (this.loading) {
      this.statusEl.className = 'list-status';
      this.statusEl.replaceChildren(h('span', { class: 'spinner' }), h('span', { text: '문제를 불러오는 중…' }));
    } else if (this.error) {
      this.statusEl.className = 'list-status error';
      this.statusEl.textContent = `${this.error}. 잠시 후 다시 시도해 주세요.`;
    } else if (shown.length === 0) {
      this.statusEl.className = 'list-status';
      this.statusEl.textContent =
        puzzles.length === 0 ? '아직 받아온 문제가 없습니다.' : '이 난이도의 문제가 없습니다. 더 불러와 보세요.';
    } else {
      this.statusEl.replaceChildren();
    }
    this.moreBtn.disabled = this.loading;
    this.moreBtn.textContent = this.error ? '다시 시도' : '문제 더 불러오기';
  }

  destroy(): void {
    this.destroyed = true;
    this.el.remove();
  }
}
