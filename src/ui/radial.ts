import { SIZE } from '../model';
import { h, vibrate } from './dom';

export interface DigitState {
  /** 현재 선택에 이미 적용된 숫자 (노트: 모든 대상에 존재, 답: 현재 답) */
  active?: boolean;
  /** 보드에 9개 모두 배치된 숫자 */
  done?: boolean;
}

export interface RadialOptions {
  /** 링에 표시할 종류 (스타일 구분용) */
  kind: 'note' | 'answer';
  isEnabled: () => boolean;
  digitState: (d: number) => DigitState;
  onPick: (d: number) => void;
}

/** 이 거리 이상 움직여야 드래그로 간주한다 (px) */
const MOVE_THRESHOLD = 14;

/**
 * 버튼을 누르고 있으면 주위에 1~9가 원형으로 펼쳐지고,
 * 숫자 위로 드래그한 뒤 손을 떼면 그 숫자가 입력된다.
 * 움직이지 않고 떼면 링이 열린 채로 남아 숫자를 탭해서 고를 수 있다.
 */
export function attachRadial(button: HTMLElement, opts: RadialOptions): void {
  let overlay: HTMLDivElement | null = null;
  let digitEls: HTMLDivElement[] = [];
  let centers: { x: number; y: number }[] = [];
  let hitRadius = 0;
  let pointerId: number | null = null;
  let start = { x: 0, y: 0 };
  let moved = false;
  let hovered: number | null = null;

  const close = () => {
    overlay?.remove();
    overlay = null;
    digitEls = [];
    hovered = null;
    pointerId = null;
    button.classList.remove('pressed');
  };

  const setHovered = (d: number | null) => {
    if (d === hovered) return;
    if (hovered !== null) digitEls[hovered - 1]?.classList.remove('hover');
    hovered = d;
    if (d !== null) {
      digitEls[d - 1]?.classList.add('hover');
      vibrate(8);
    }
  };

  const digitAt = (x: number, y: number): number | null => {
    let best: number | null = null;
    let bestDist = Infinity;
    centers.forEach((c, i) => {
      const dist = Math.hypot(x - c.x, y - c.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = i + 1;
      }
    });
    return bestDist <= hitRadius ? best : null;
  };

  const open = () => {
    const rect = button.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const radius = Math.min(116, vw * 0.3);
    const size = Math.min(60, radius * 0.58);
    const margin = 8;
    const reach = radius + size / 2 + margin;
    // 링이 화면 밖으로 나가지 않도록 중심을 보정한다
    const cx = Math.min(Math.max(rect.left + rect.width / 2, reach), vw - reach);
    const cy = Math.min(Math.max(rect.top + rect.height / 2, reach), vh - reach);
    hitRadius = radius * 0.55;

    overlay = h('div', { class: `radial radial-${opts.kind}` });
    overlay.append(
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
    centers = [];
    digitEls = [];
    for (let d = 1; d <= SIZE; d++) {
      // 1이 12시 방향, 시계 방향으로 배치
      const angle = -Math.PI / 2 + ((d - 1) * 2 * Math.PI) / SIZE;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      centers.push({ x, y });
      const st = opts.digitState(d);
      const cls = ['radial-digit'];
      if (st.active) cls.push('active');
      if (st.done) cls.push('done');
      const el = h('div', {
        class: cls.join(' '),
        style: `left:${x}px;top:${y}px;width:${size}px;height:${size}px;font-size:${size * 0.48}px`,
        text: d,
      });
      digitEls.push(el);
      overlay.append(el);
    }
    document.body.append(overlay);
    button.classList.add('pressed');
  };

  /** 탭으로 열린 상태(손을 뗀 뒤)에서 숫자를 고르는 모드 */
  const makeSticky = () => {
    if (!overlay) return;
    overlay.classList.add('sticky');
    const ov = overlay;
    ov.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const d = digitAt(e.clientX, e.clientY);
      setHovered(d);
    });
    ov.addEventListener('pointerup', (e) => {
      const d = digitAt(e.clientX, e.clientY);
      close();
      if (d !== null) opts.onPick(d);
    });
    ov.addEventListener('pointercancel', close);
  };

  button.addEventListener('pointerdown', (e) => {
    if (pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!opts.isEnabled()) return;
    e.preventDefault();
    if (overlay) close();
    pointerId = e.pointerId;
    start = { x: e.clientX, y: e.clientY };
    moved = false;
    button.setPointerCapture(e.pointerId);
    open();
  });

  button.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId || !overlay) return;
    if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) >= MOVE_THRESHOLD) moved = true;
    if (moved) setHovered(digitAt(e.clientX, e.clientY));
  });

  button.addEventListener('pointerup', (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (!moved) {
      makeSticky();
      return;
    }
    const d = digitAt(e.clientX, e.clientY);
    close();
    if (d !== null) opts.onPick(d);
  });

  button.addEventListener('pointercancel', (e) => {
    if (e.pointerId === pointerId) close();
  });

  // 길게 누를 때 뜨는 컨텍스트 메뉴 방지
  button.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', () => overlay && close());
}
