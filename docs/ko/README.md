# slack-bridge 🌉

> 슬랙을 진짜 사람처럼 쓰세요. 봇이 아니라.

**slack-bridge**는 AI 에이전트가 실제 사용자 계정으로 Slack을 사용할 수 있게 해주는 브라우저 기반 브릿지입니다. 봇 토큰 없이, `BOT` 딱지 없이, 사람이 하는 것과 100% 동일하게.

## 문제

Slack Bot API의 한계:
- 메시지에 `BOT` 딱지가 붙음 — 모두가 봇임을 알 수 있음
- 봇은 사람이 할 수 있는 모든 걸 할 수 없음
- Slack App 생성, OAuth 스코프 관리, 봇 유저 충돌 문제
- AI 에이전트를 "팀원"으로 만들고 싶다면, 봇 계정으로는 부족함

## 해결책

**slack-bridge**는 브라우저 자동화로 실제 사용자로 Slack에 로그인하고, 세션 인증 정보를 추출해서, Slack의 내부 API로 사람이 할 수 있는 모든 것을 수행합니다 — 읽기, 쓰기, 리액션, 파일 업로드, 검색 — 모두 실제 사용자의 신원으로.

```
┌──────────────┐
│  AI 에이전트   │  (OpenClaw, Claude 등)
└──────┬───────┘
       │  이벤트 / 액션
       ▼
┌──────────────┐
│ slack-bridge │  ← 마법의 레이어
└──────┬───────┘
       │  xoxc- 토큰 + 쿠키
       ▼
┌──────────────┐
│  Slack 웹    │  (진짜 사람으로)
└──────────────┘
```

브라우저는 **로그인할 때만** 사용됩니다. 이후 모든 통신은 API 호출로 — 빠르고, 안정적이고, 보이지 않게.

## 기능

### Phase 1 (MVP)
- 🔐 브라우저 기반 로그인 (Google OAuth, 이메일/비밀번호)
- 🔑 세션 토큰 추출 및 암호화 저장
- 💬 메시지 전송 / 읽기 / 수정 / 삭제
- 🔄 WebSocket 실시간 메시지 수신
- 📡 Webhook 기반 이벤트 전달
- 🖥️ CLI 인터페이스

### Phase 2
- 😀 리액션, 📎 파일, 🧵 스레드, 📢 채널 관리
- 👤 프로필 관리, 🔍 검색, 💌 DM
- 🔁 자동 재접속 + 헬스체크

### Phase 3
- 🔌 OpenClaw 채널 플러그인
- 🌐 다중 워크스페이스
- 🐳 Docker

## 빠른 시작

```bash
npm install -g slack-bridge
slack-bridge login --workspace your-workspace.slack.com
slack-bridge start
```

## 설정

모든 인증 정보는 환경변수로 관리합니다. `.env.example` 참고.

## 문서

| 문서 | 설명 |
|------|------|
| [아키텍처](../architecture/overview.md) | 시스템 설계 |
| [인증 스펙](../specs/auth.md) | 로그인 및 토큰 관리 |
| [클라이언트 스펙](../specs/client.md) | Slack 내부 API |
| [WebSocket 스펙](../specs/websocket.md) | 실시간 이벤트 |
| [브릿지 스펙](../specs/bridge.md) | AI 에이전트 연동 |
| [세션 스펙](../specs/session.md) | 세션 관리 |
| [보안](../guides/security.md) | 보안 모델 |
| [설정](../guides/configuration.md) | 환경변수 |

## Bot API vs slack-bridge

| | Bot API | slack-bridge |
|---|---------|-------------|
| 신원 | `BOT` 딱지 | 진짜 사람 |
| 설정 | Slack App + OAuth | 로그인만 |
| 권한 | 스코프 제한 | 사람이 할 수 있는 모든 것 |
| 이중 계정 | 봇 + 사용자 공존 | 단일 계정 |

## 라이선스

MIT

---

Built with 💎 by [Ironact](https://github.com/Ironact)
