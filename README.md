# 스도쿠

모바일용 스도쿠 PWA. 문제는 [sudoku-api](https://sudoku-api.vercel.app/)에서 받아온다.
Vanilla TypeScript + Vite, UI 프레임워크 없음.

## 실행

```bash
npm install
npm run dev       # 개발 서버 (--host: 같은 와이파이의 휴대폰에서 접속 가능)
npm test          # 규칙 단위 테스트
npm run build     # 타입 검사 + 프로덕션 빌드 (dist/)
npm run preview   # 빌드 결과 미리보기 (서비스 워커 포함)
```

하위 경로에 배포할 때는 `BASE_PATH=/sudoku/ npm run build`처럼 지정한다.
아이콘을 다시 만들려면 `node scripts/gen-icons.mjs`.

> 서비스 워커와 "홈 화면에 추가"는 HTTPS(또는 localhost)에서만 동작한다.
> 휴대폰에서 PWA 설치까지 확인하려면 Vercel/Netlify/GitHub Pages 등에 배포해서 접속한다.

## 조작

- **칸 선택**: 탭하면 한 칸, 드래그하면 지나간 칸 모두
- **노트 / 답**: 버튼을 누른 채 링의 숫자로 드래그해서 손을 떼면 입력. 숫자 밖에서 떼면 취소.
  버튼을 짧게 탭하면 링이 열린 채로 남아서 숫자를 탭해 고를 수 있다.
- **노트 규칙**: 답이 있는 칸을 제외한 선택 칸 모두에 그 숫자가 있으면 제거, 아니면 모두에 추가
- **답**: 한 칸만 선택했을 때만 가능. 넣으면 같은 행/열/박스의 같은 숫자 노트를 자동으로 지운다.
- **지우기**: 선택 칸의 답과 노트를 모두 지운다 (제시 숫자는 유지)
- **시작할 때 노트 채우기** (목록 화면 옵션): 새 게임을 시작할 때 제시 숫자를 기준으로 가능한 후보를 모든 빈칸에 노트로 넣는다.
  시작 상태로 들어가므로 undo로 사라지지 않는다.
- **설정 → 오답 즉시 표시**: 정답과 다른 답을 바로 빨간색으로 표시. 꺼져 있으면 행/열/박스 충돌만 표시.
- 키보드: 숫자=답, Shift/Alt+숫자=노트, 방향키 이동, Backspace 지우기, Ctrl+Z / Ctrl+Y

## 구조

```
src/
  model.ts         보드 규칙 (순수 함수, Change[] 반환)
  history.ts       undo/redo 스택 (동작 하나 = 한 단계)
  api.ts           문제 API 호출/검증
  storage.ts       localStorage 저장 (진행 게임, 설정, 문제 목록, 완료 기록)
  timer.ts         일시정지 가능한 타이머
  ui/board.ts      보드 렌더링, 탭/드래그 선택
  ui/radial.ts     숫자 링 제스처
  ui/gameScreen.ts 게임 화면
  ui/listScreen.ts 문제 목록 화면
tests/model.test.ts
```

## API 메모

- 난이도를 지정하는 파라미터가 없어서, 10개씩 받아 목록에서 난이도별로 골라 시작한다.
- `limit` 20 이상은 서버 타임아웃이 나서 10으로 제한했다. 실패하면 한 번 자동으로 다시 시도한다.
