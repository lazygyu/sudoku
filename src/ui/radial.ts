import { SIZE } from '../model';
import { h, vibrate } from './dom';

export interface DigitState {
  /** 현재 선택에 이미 적용된 숫자 (노트: 모든 대상에 존재, 답: 현재 답) */
  active?: boolean;
  /** 보드에 9개 모두 배치된 숫자 */
  done?: boolean;
}

export interface RadialMenuOptions {
  /** 링에 표시할 종류 (스타일 구분용) */
  kind: 'note' | 'answer';
  digitState: (d: number) => DigitState;
  onPick: (d: number) => void;
  /** 링이 닫힐 때 (숫자를 골랐든 취소했든) */
  onClose?: () => void;
}

export interface RadialOptions extends RadialMenuOptions {
  isEnabled: () => boolean;
}

export interface Point {
  x: number;
  y: number;
}

/** 이 거리 이상 움직여야 드래그로 간주한다 (px) */
const MOVE_THRESHOLD = 14;

/**
 * 1~9 숫자 링 하나의 생명주기.
 * 누르고 있는 포인터의 move/end 를 전달받아, 숫자 위에서 손을 떼면 그 숫자를 고른다.
 * 움직이지 않고 손을 떼면 링이 열린 채로 남아 숫자를 탭해서 고를 수 있다.
 */
export class RadialSession {
  private readonly overlay: HTMLDivElement;
  private readonly digitEls: HTMLDivElement[] = [];
  private readonly centers: Point[] = [];
  private readonly hitRadius: number;
  private moved = false;
  private hovered: number | null = null;
  private closed = false;
  private readonly onBlur = () => this.close();

  /**
   * @param center 링의 중심으로 삼을 위치 (화면 밖으로 나가지 않게 보정됨)
   * @param start 링을 연 포인터의 현재 위치
   */
  constructor(
    private readonly opts: RadialMenuOptions,
    center: Point,
    private readonly start: Point,
  ) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const radius = Math.min(116, vw * 0.3);
    const size = Math.min(60, radius * 0.58);
    const reach = radius + size / 2 + 8;
    const cx = Math.min(Math.max(center.x, reach), vw - reach);
    const cy = Math.min(Math.max(center.y, reach), vh - reach);
    this.hitRadius = radius * 0.55;

    this.overlay = h('div', { class: `radial radial-${opts.kind}` });
    this.overlay.append(
      h('div', {
        class: 'radial-ring',
        style: `left:${cx}px;top:${cy}px;width:${radius * 2 + size}px;height:${radius * 2 + size}px`,
      }),
      h('div', {
        class: 'radial-label',
        style: `left:${cx}px;top:${cy}px`,
        text: opts.kind === 'note' ? '노트' : '답',
      }),
    );
    for (let d = 1; d <= SIZE; d++) {
      // 1이 12시 방향, 시계 방향으로 배치
      const angle = -Math.PI / 2 + ((d - 1) * 2 * Math.PI) / SIZE;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      this.centers.push({ x, y });
      const st = opts.digitState(d);
      const cls = ['radial-digit'];
      if (st.active) cls.push('active');
      if (st.done) cls.push('done');
      const el = h('div', {
        class: cls.join(' '),
        style: `left:${x}px;top:${y}px;width:${size}px;height:${size}px;font-size:${size * 0.48}px`,
        text: d,
      });
      this.digitEls.push(el);
      this.overlay.append(el);
    }
    document.body.append(this.overlay);
    window.addEventListener('blur', this.onBlur);
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  private digitAt(x: number, y: number): number | null {
    let best: number | null = null;
    let bestDist = Infinity;
    this.centers.forEach((c, i) => {
      const dist = Math.hypot(x - c.x, y - c.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = i + 1;
      }
    });
    return bestDist <= this.hitRadius ? best : null;
  }

  private setHovered(d: number | null): void {
    if (d === this.hovered) return;
    if (this.hovered !== null) this.digitEls[this.hovered - 1]?.classList.remove('hover');
    this.hovered = d;
    if (d !== null) {
      this.digitEls[d - 1]?.classList.add('hover');
      vibrate(8);
    }
  }

  move(x: number, y: number): void {
    if (this.closed) return;
    if (!this.moved && Math.hypot(x - this.start.x, y - this.start.y) >= MOVE_THRESHOLD) this.moved = true;
    if (this.moved) this.setHovered(this.digitAt(x, y));
  }

  end(x: number, y: number): void {
    if (this.closed) return;
    if (!this.moved) {
      this.makeSticky();
      return;
    }
    this.pickAt(x, y);
  }

  private pickAt(x: number, y: number): void {
    const d = this.digitAt(x, y);
    this.close();
    if (d !== null) this.opts.onPick(d);
  }

  /** 손을 뗀 뒤에도 열려 있는 상태: 숫자를 탭하면 고르고, 바깥을 탭하면 닫는다 */
  private makeSticky(): void {
    const ov = this.overlay;
    ov.classList.add('sticky');
    ov.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.setHovered(this.digitAt(e.clientX, e.clientY));
    });
    ov.addEventListener('pointerup', (e) => this.pickAt(e.clientX, e.clientY));
    ov.addEventListener('pointercancel', () => this.close());
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.overlay.remove();
    window.removeEventListener('blur', this.onBlur);
    this.opts.onClose?.();
  }
}

/** 버튼을 누르고 있으면 버튼 주위에 숫자 링을 띄운다 */
export function attachRadial(button: HTMLElement, opts: RadialOptions): void {
  let session: RadialSession | null = null;
  let pointerId: number | null = null;

  button.addEventListener('pointerdown', (e) => {
    if (pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!opts.isEnabled()) return;
    e.preventDefault();
    session?.close();
    pointerId = e.pointerId;
    button.setPointerCapture(e.pointerId);
    const rect = button.getBoundingClientRect();
    button.classList.add('pressed');
    session = new RadialSession(
      {
        ...opts,
        onClose: () => {
          button.classList.remove('pressed');
          opts.onClose?.();
        },
      },
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      { x: e.clientX, y: e.clientY },
    );
  });

  button.addEventListener('pointermove', (e) => {
    if (e.pointerId === pointerId) session?.move(e.clientX, e.clientY);
  });

  button.addEventListener('pointerup', (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    session?.end(e.clientX, e.clientY);
  });

  button.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    session?.close();
  });

  // 길게 누를 때 뜨는 컨텍스트 메뉴 방지
  button.addEventListener('contextmenu', (e) => e.preventDefault());
}
