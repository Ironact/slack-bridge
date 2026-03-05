# slack-bridge — Project Plan

> Use Slack as a real human, not a bot.

## 🎯 목표

AI agent(OpenClaw 등)가 Slack을 **진짜 사람 계정**으로 사용할 수 있게 해주는 브릿지.
봇 토큰 없이, BOT 딱지 없이, 사람이 하는 것과 100% 동일하게.

## 🧠 핵심 아이디어

Slack 웹 클라이언트도 내부적으로 API를 호출한다.
→ 브라우저 로그인으로 세션 토큰(`xoxc-` + 쿠키)을 얻고
→ 그 토큰으로 Slack 내부 API를 직접 호출하면
→ 사람 계정으로 모든 작업이 가능하다.

UI 클릭/타이핑이 아니라 **API 레벨**에서 동작하므로 안정적이고 빠르다.

## 🏗️ 아키텍처

```
┌─────────────┐
│  AI Agent   │  (OpenClaw, Claude, etc.)
│  (Consumer) │
└──────┬──────┘
       │ Events / Actions (webhook, stdio, etc.)
       ▼
┌─────────────────────────────┐
│       slack-bridge          │
│                             │
│  ┌─────────┐ ┌───────────┐ │
│  │  Auth    │ │  Session  │ │
│  │  Layer   │ │  Manager  │ │
│  └────┬────┘ └─────┬─────┘ │
│       │             │       │
│  ┌────▼─────────────▼────┐  │
│  │    Slack Client       │  │
│  │  ┌─────┐  ┌────────┐ │  │
│  │  │ API │  │  WS    │ │  │
│  │  │Call │  │Listener│ │  │
│  │  └─────┘  └────────┘ │  │
│  └───────────────────────┘  │
└──────────────┬──────────────┘
               │ xoxc- token + cookies
               ▼
┌─────────────────────────────┐
│     Slack Web (as human)    │
└─────────────────────────────┘
```

## 📦 모듈 설계

### 1. Auth Layer (`src/auth/`)
- Playwright로 Slack 웹 로그인 (Google OAuth, 이메일/비번, SSO 등)
- 로그인 후 `xoxc-` 토큰 + `d` 쿠키 추출
- 세션 정보를 로컬에 암호화 저장 (재시작 시 재로그인 불필요)
- 2FA/CAPTCHA 핸들링 (필요시 사용자에게 프롬프트)

### 2. Session Manager (`src/session/`)
- 토큰 유효성 체크 (주기적)
- 만료 시 자동 갱신 (브라우저 세션 이용)
- 재접속 로직 (네트워크 끊김, 서버 에러 등)
- 헬스체크 엔드포인트

### 3. Slack Client (`src/client/`)

#### 3a. API Client (`src/client/api.ts`)
Slack 내부 API 호출 (xoxc- 토큰 + 쿠키 사용)

**메시지:**
- `chat.postMessage` — 메시지 전송
- `chat.update` — 메시지 수정
- `chat.delete` — 메시지 삭제
- `conversations.history` — 채널 히스토리
- `conversations.replies` — 스레드 조회

**리액션:**
- `reactions.add` — 리액션 추가
- `reactions.remove` — 리액션 제거

**파일:**
- `files.upload` — 파일 업로드
- `files.list` — 파일 목록
- `files.delete` — 파일 삭제

**채널:**
- `conversations.list` — 채널 목록
- `conversations.join` — 채널 참여
- `conversations.leave` — 채널 나가기
- `conversations.create` — 채널 생성
- `conversations.info` — 채널 정보

**유저:**
- `users.list` — 유저 목록
- `users.info` — 유저 정보
- `users.profile.set` — 프로필/상태 변경

**검색:**
- `search.messages` — 메시지 검색
- `search.files` — 파일 검색

**DM:**
- `conversations.open` — DM 열기

#### 3b. WebSocket Listener (`src/client/websocket.ts`)
실시간 이벤트 수신

- Slack RTM(Real Time Messaging) WebSocket 연결
- 이벤트 타입:
  - `message` — 새 메시지 (채널, DM, 스레드)
  - `reaction_added` / `reaction_removed`
  - `message_changed` / `message_deleted`
  - `member_joined_channel` / `member_left_channel`
  - `channel_created` / `channel_renamed`
  - `user_typing`
  - `presence_change`
- 이벤트 파싱 → 정규화된 이벤트 객체로 변환
- 자동 재접속 (heartbeat/ping-pong)

### 4. Bridge Layer (`src/bridge/`)
AI Agent와의 인터페이스

**이벤트 발행 (Slack → Agent):**
- 새 메시지 수신 시 webhook/callback으로 전달
- 이벤트 필터링 (특정 채널만, 멘션만, etc.)
- 컨텍스트 풍부화 (채널 정보, 유저 정보, 스레드 맥락 포함)

**액션 수신 (Agent → Slack):**
- 메시지 보내기
- 리액션 달기
- 파일 업로드
- 채널 관리
- 검색 실행

**지원 인터페이스 (Phase별):**
- Phase 1: HTTP Webhook (가장 범용적)
- Phase 2: WebSocket 양방향
- Phase 3: OpenClaw 채널 플러그인
- Future: MCP 서버

### 5. Config (`src/config/`)
```yaml
# .env.example
SLACK_WORKSPACE_URL=your-workspace.slack.com
SLACK_EMAIL=your@email.com
SLACK_PASSWORD=your-password          # 또는 Google OAuth
SLACK_SESSION_DIR=./data/sessions     # 세션 저장 경로
SLACK_SESSION_ENCRYPT_KEY=            # 세션 암호화 키

BRIDGE_MODE=webhook                   # webhook | websocket | openclaw
BRIDGE_WEBHOOK_URL=http://localhost:3000/slack-events
BRIDGE_PORT=3001                      # 브릿지 HTTP 서버 포트
BRIDGE_AUTH_TOKEN=                    # API 인증 토큰

# 필터링
BRIDGE_CHANNELS=general,dev-feed      # 모니터링할 채널 (비면 전체)
BRIDGE_MENTION_ONLY=false             # 멘션만 전달?
BRIDGE_INCLUDE_BOTS=false             # 봇 메시지 포함?

# 로깅
LOG_LEVEL=info
LOG_FILE=./data/logs/bridge.log
```

## 🚀 Phase별 로드맵

### Phase 1: 코어 (MVP)
- [ ] Playwright 로그인 → 토큰 추출
- [ ] xoxc- 토큰으로 Slack 내부 API 호출 (메시지 읽기/쓰기)
- [ ] WebSocket 실시간 메시지 수신
- [ ] HTTP webhook으로 이벤트 전달
- [ ] 세션 저장/복원
- [ ] .env 기반 설정
- [ ] CLI (`slack-bridge start`, `slack-bridge login`, `slack-bridge status`)

### Phase 2: 완성도
- [ ] 리액션, 파일 업/다운로드, 스레드
- [ ] 채널 관리 (생성, 참여, 나가기)
- [ ] 유저 프로필/상태 관리
- [ ] 검색
- [ ] DM 지원
- [ ] 이벤트 필터링 (채널별, 멘션별)
- [ ] 자동 재접속 + 헬스체크
- [ ] Rate limiting 핸들링

### Phase 3: 통합
- [ ] OpenClaw 채널 플러그인
- [ ] WebSocket 양방향 인터페이스
- [ ] 다중 워크스페이스 지원
- [ ] Docker 이미지

### Future
- [ ] MCP 서버 인터페이스
- [ ] Slack Connect 지원
- [ ] 캔버스/리스트 조작
- [ ] 타이핑 인디케이터 (사람처럼 타이핑 중... 표시)

## 🔒 보안 원칙

1. **모든 credential은 환경변수** — 코드에 절대 하드코딩 안 함
2. **세션 토큰 암호화 저장** — 평문으로 디스크에 안 씀
3. **최소 권한** — 필요한 채널/기능만 활성화
4. **로그에 토큰 노출 금지** — 마스킹 처리
5. **.env 파일은 .gitignore** — 절대 커밋 안 함

## 🛠️ 기술 스택

- **Runtime:** Node.js (TypeScript)
- **Browser Automation:** Playwright (로그인 + 세션 관리)
- **HTTP Server:** Fastify or Express (webhook/API)
- **WebSocket:** ws (Slack RTM 연결)
- **Config:** dotenv + env validation (zod)
- **Build:** tsup or esbuild
- **Testing:** vitest
- **CI/CD:** GitHub Actions

## 📁 프로젝트 구조

```
slack-bridge/
├── README.md
├── PLAN.md
├── LICENSE                  # MIT
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── src/
│   ├── index.ts             # Entry point
│   ├── cli.ts               # CLI commands
│   ├── auth/
│   │   ├── login.ts         # Playwright login flows
│   │   ├── token.ts         # Token extraction
│   │   └── storage.ts       # Encrypted session storage
│   ├── client/
│   │   ├── api.ts           # Slack internal API client
│   │   ├── websocket.ts     # WebSocket real-time listener
│   │   └── types.ts         # Slack event/message types
│   ├── bridge/
│   │   ├── server.ts        # HTTP webhook server
│   │   ├── events.ts        # Event normalization
│   │   └── actions.ts       # Action handler (agent → slack)
│   ├── session/
│   │   ├── manager.ts       # Session lifecycle
│   │   └── health.ts        # Health checks
│   └── config/
│       ├── env.ts           # Env validation
│       └── schema.ts        # Config schema (zod)
├── data/                    # Runtime data (gitignored)
│   ├── sessions/
│   └── logs/
└── tests/
    ├── auth.test.ts
    ├── client.test.ts
    └── bridge.test.ts
```

## ❓ 열린 질문들

1. **Slack 내부 API 안정성** — 공식 API가 아니라 변경될 수 있음. 버전 감지 + fallback 필요?
2. **Rate limiting** — Slack이 내부 API에도 rate limit을 걸 수 있음. 어떻게 핸들링?
3. **다중 워크스페이스** — Phase 1에서부터 고려? 아니면 나중에?
4. **인증 방식** — Google OAuth만? 이메일/비번도? SSO(SAML)?
5. **OpenClaw 연동** — 커스텀 채널 플러그인 vs webhook?
