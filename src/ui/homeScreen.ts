import { ApiKeyError, BUILT_IN_KEY, DIFFICULTIES, difficultyLabel, fetchUniquePuzzle, type Difficulty, type Puzzle } from '../api';
import { CELL_COUNT, valueOf, type Cell } from '../model';
import { loadSpare, saveSettings, saveSpare, type SavedGame, type Settings } from '../storage';
import { formatTime } from '../timer';
import { h } from './dom';

export interface HomeScreenOptions {
  saved: SavedGame | null;
  settings: Settings;
  /** 진행 중인 게임을 버리고 새로 시작해도 되는지 사용자에게 묻는다 */
  confirmNew: () => boolean;
  onNew: (puzzle: Puzzle) => void;
  onContinue: (saved: SavedGame) => void;
}

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

/** 다음 게임을 바로 시작할 수 있도록 미리 한 문제를 받아둔다. 실패해도 조용히 넘어간다 */
const refilling = new Set<Difficulty>();
function refillSpare(d: Difficulty, key: string): void {
  if (refilling.has(d) || loadSpare(d)) return;
  refilling.add(d);
  fetchUniquePuzzle(d, key)
    .then((p) => saveSpare(d, p))
    .catch(() => {})
    .finally(() => refilling.delete(d));
}

export class HomeScreen {
  readonly el: HTMLDivElement;
  private readonly diffEl: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;
  private readonly keyDetails: HTMLDetailsElement;
  private loading: Difficulty | null = null;
  private error: string | null = null;
  private destroyed = false;

  constructor(private readonly opts: HomeScreenOptions) {
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

    this.diffEl = h('div', { class: 'difficulty-grid' });
    this.statusEl = h('div', { class: 'list-status', role: 'status' });

    const autoFill = h('input', { type: 'checkbox' });
    autoFill.checked = opts.settings.autoFillNotes;
    autoFill.addEventListener('change', () => {
      opts.settings.autoFillNotes = autoFill.checked;
      saveSettings(opts.settings);
    });

    const keyInput = h('input', {
      class: 'text-input',
      type: 'password',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: BUILT_IN_KEY ? '기본 키 사용 중' : 'API 키 붙여넣기',
    });
    keyInput.value = opts.settings.apiKey;
    keyInput.addEventListener('change', () => {
      opts.settings.apiKey = keyInput.value.trim();
      saveSettings(opts.settings);
      this.error = null;
      this.render();
    });
    this.keyDetails = h(
      'details',
      { class: 'option-row key-row' },
      h('summary', { text: 'API Ninjas 키' }),
      h(
        'label',
        { class: 'key-field' },
        keyInput,
        h('span', {
          class: 'option-desc',
          text: '문제는 api-ninjas.com 에서 받아옵니다. 무료 가입 후 받은 키를 넣어 주세요. 키는 이 기기에만 저장됩니다.',
        }),
      ),
    );
    // 쓸 수 있는 키가 없으면 처음부터 펼쳐 둔다
    this.keyDetails.open = !this.apiKey;

    sections.push(
      h('div', { class: 'section-title', text: '새 게임' }),
      this.diffEl,
      this.statusEl,
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
      this.keyDetails,
    );
    this.el = h('div', { class: 'screen list-screen' }, ...sections);

    this.render();
  }

  private get apiKey(): string {
    return this.opts.settings.apiKey || BUILT_IN_KEY;
  }

  private async start(d: Difficulty): Promise<void> {
    if (this.loading) return;
    if (!this.opts.confirmNew()) return;

    const key = this.apiKey;
    const spare = loadSpare(d);
    if (spare) {
      saveSpare(d, null);
      if (key) refillSpare(d, key);
      this.opts.onNew(spare);
      return;
    }
    if (!key) {
      this.error = 'API 키를 먼저 입력해 주세요';
      this.keyDetails.open = true;
      this.render();
      return;
    }

    this.loading = d;
    this.error = null;
    this.render();
    try {
      const puzzle = await fetchUniquePuzzle(d, key);
      if (this.destroyed) return;
      refillSpare(d, key);
      this.opts.onNew(puzzle);
    } catch (e) {
      this.error = (e as Error).message || '문제를 불러오지 못했습니다';
      if (e instanceof ApiKeyError) this.keyDetails.open = true;
    } finally {
      this.loading = null;
      if (!this.destroyed) this.render();
    }
  }

  private render(): void {
    this.diffEl.replaceChildren(
      ...DIFFICULTIES.map((d) => {
        const busy = this.loading === d;
        const b = h(
          'button',
          {
            class: `difficulty-btn diff-${d.toLowerCase()}${busy ? ' busy' : ''}`,
            type: 'button',
            'aria-busy': busy,
          },
          busy ? h('span', { class: 'spinner' }) : h('span', { class: 'difficulty-dot' }),
          h('span', { class: 'difficulty-name', text: difficultyLabel(d) }),
        );
        b.disabled = this.loading !== null;
        b.addEventListener('click', () => void this.start(d));
        return b;
      }),
    );

    if (this.error) {
      this.statusEl.className = 'list-status error';
      this.statusEl.textContent = this.error;
    } else {
      this.statusEl.className = 'list-status';
      this.statusEl.replaceChildren();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.el.remove();
  }
}
