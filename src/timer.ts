/** 일시정지 가능한 경과 시간 타이머 */
export class Timer {
  private startedAt: number | null = null;

  constructor(private accumulated = 0) {}

  get running(): boolean {
    return this.startedAt !== null;
  }

  start(): void {
    if (this.startedAt === null) this.startedAt = performance.now();
  }

  pause(): void {
    if (this.startedAt !== null) {
      this.accumulated += performance.now() - this.startedAt;
      this.startedAt = null;
    }
  }

  get elapsedMs(): number {
    return this.accumulated + (this.startedAt === null ? 0 : performance.now() - this.startedAt);
  }
}

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
