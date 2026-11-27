import './style.css';
import { registerSW } from 'virtual:pwa-register';
import type { Puzzle } from './api';
import { clearGame, loadGame, loadSettings, type SavedGame } from './storage';
import { GameScreen } from './ui/gameScreen';
import { HomeScreen } from './ui/homeScreen';

registerSW({ immediate: true });

const root = document.getElementById('app')!;
const settings = loadSettings();
let current: { destroy(): void } | null = null;

function mount(screen: { el: HTMLElement; destroy(): void }): void {
  current?.destroy();
  current = screen;
  root.append(screen.el);
  window.scrollTo(0, 0);
}

function showList(): void {
  mount(
    new HomeScreen({
      saved: loadGame(),
      settings,
      confirmNew: () =>
        !loadGame() || confirm('진행 중인 게임이 있습니다. 새 게임을 시작하면 진행 상황이 사라집니다. 계속할까요?'),
      onNew: (p) => {
        clearGame();
        startGame(p, null);
      },
      onContinue: (s) => startGame(s.puzzle, s),
    }),
  );
}

function startGame(puzzle: Puzzle, saved: SavedGame | null): void {
  // 안드로이드 뒤로 가기 버튼으로 홈 화면에 돌아갈 수 있도록 히스토리 항목을 추가한다
  history.pushState({ screen: 'game' }, '');
  mount(new GameScreen({ puzzle, saved, settings, onExit: () => history.back() }));
}

window.addEventListener('popstate', () => {
  if (current instanceof GameScreen) showList();
});

// 핀치 줌, 더블탭 확대 방지 (iOS Safari 는 viewport 설정을 무시함)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

const saved = loadGame();
if (saved && history.state?.screen === 'game') {
  mount(new GameScreen({ puzzle: saved.puzzle, saved, settings, onExit: () => history.back() }));
} else {
  history.replaceState(null, '');
  showList();
}
