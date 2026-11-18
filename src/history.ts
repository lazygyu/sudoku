import type { Change } from './model';

export type Step = readonly Change[];

export interface HistoryData {
  past: Step[];
  future: Step[];
}

/** 사용자 동작 하나(Change 묶음)를 한 단계로 저장하는 undo/redo 스택 */
export class History {
  private past: Step[];
  private future: Step[];

  constructor(data?: HistoryData, private readonly limit = 1000) {
    this.past = data?.past ? [...data.past] : [];
    this.future = data?.future ? [...data.future] : [];
  }

  push(step: Step): void {
    if (step.length === 0) return;
    this.past.push(step);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  /** 되돌릴 단계를 꺼낸다. 호출자가 backward 로 적용해야 한다. */
  undo(): Step | undefined {
    const step = this.past.pop();
    if (step) this.future.push(step);
    return step;
  }

  /** 다시 실행할 단계를 꺼낸다. 호출자가 forward 로 적용해야 한다. */
  redo(): Step | undefined {
    const step = this.future.pop();
    if (step) this.past.push(step);
    return step;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  toJSON(): HistoryData {
    return { past: this.past, future: this.future };
  }
}
