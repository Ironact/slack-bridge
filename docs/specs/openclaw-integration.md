# OpenClaw Integration Spec (v2)

## 목표
slack-bridge를 OpenClaw 커스텀 채널 플러그인으로 연동.
**송수신 모두 xoxc- 유저 토큰** → 봇 딱지 제로.

## 아키텍처

```
슬랙 채널/DM
    ↕ (RTM WebSocket + SDK API, xoxc- 토큰)
slack-bridge 서버 (Fastify + RTM)
    ↕ (HTTP webhook 양방향)
OpenClaw Gateway
    ↕
AI Agent (Vision)
```

## 데이터 플로우

### 인바운드 (슬랙 → AI)
1. 슬랙 유저가 메시지 보냄 (or @VISION 멘션)
2. RTM WebSocket이 이벤트 수신
3. slack-bridge가 이벤트를 OpenClaw 포맷으로 변환
4. OpenClaw webhook endpoint로 POST
5. OpenClaw가 AI 세션에 메시지 주입
6. AI가 응답 생성

### 아웃바운드 (AI → 슬랙)
1. AI가 응답 텍스트 생성
2. OpenClaw가 slack-bridge API로 POST
3. slack-bridge가 xoxc- 토큰으로 chat.postMessage
4. 슬랙에 사람 계정(VISION)으로 메시지 게시

## 모듈 구조

### 1. OpenClaw Connector (신규)
`src/connector/openclaw.ts`
- RTM 이벤트 → OpenClaw webhook 포맷 변환
- 멘션 필터링 (@VISION 또는 DM만 전달)
- 메시지 메타데이터 (채널, 스레드, 유저 정보) 포함
- OpenClaw webhook URL로 POST

### 2. Outbound Handler (신규)
`src/connector/outbound.ts`
- OpenClaw로부터 응답 수신 (POST /api/v1/openclaw/reply)
- 채널/스레드 타겟팅
- slack-bridge의 Slack Client로 메시지 전송

### 3. CLI 업데이트
`src/cli.ts` — `slack-bridge start`에 OpenClaw 모드 추가
- `--openclaw-url <url>` — OpenClaw webhook URL
- `--openclaw-token <token>` — 인증 토큰
- 또는 env: `OPENCLAW_WEBHOOK_URL`, `OPENCLAW_WEBHOOK_TOKEN`

### 4. OpenClaw 커스텀 채널 플러그인 (대안)
OpenClaw 플러그인 시스템으로 직접 등록할 수 있으면 더 깔끔.
- `plugins.entries.slack-bridge`로 등록
- 플러그인 manifest 작성
- 리서치 필요: OpenClaw 커스텀 채널 플러그인 API

## Webhook 포맷

### 인바운드 (slack-bridge → OpenClaw)
```json
{
  "type": "message",
  "channel": { "id": "C0A4RS9QJFP", "name": "general" },
  "user": { "id": "U123", "name": "abel", "displayName": "Abel Ko" },
  "message": {
    "ts": "1772774109.482149",
    "text": "@VISION 안녕!",
    "threadTs": null
  },
  "mentioned": true,
  "workspace": { "id": "T0A37JX8BC4", "name": "Muhak 3-7" }
}
```

### 아웃바운드 (OpenClaw → slack-bridge)
```json
{
  "channel": "C0A4RS9QJFP",
  "text": "안녕! 무엇을 도와줄까?",
  "threadTs": "1772774109.482149",
  "replyBroadcast": false
}
```

## 환경 변수
```bash
# slack-bridge
SLACK_BRIDGE_PORT=3847
SLACK_BRIDGE_HOST=127.0.0.1

# OpenClaw 연동
OPENCLAW_WEBHOOK_URL=http://localhost:18789/webhook/slack-bridge
OPENCLAW_WEBHOOK_TOKEN=<shared-secret>

# 멘션 필터
SLACK_MENTION_USER_ID=U_VISION_ID
SLACK_FORWARD_DMS=true
SLACK_FORWARD_MENTIONS=true
```

## 태스크 분배

### Vision
- [ ] OpenClaw 커스텀 채널/플러그인 API 리서치
- [ ] OpenClaw config 연동 설계
- [ ] Outbound handler 구현 (OpenClaw → slack-bridge → 슬랙)

### Friday
- [ ] OpenClaw Connector 모듈 구현 (RTM → webhook 변환)
- [ ] CLI 업데이트 (--openclaw-* 옵션)
- [ ] 인바운드 파이프라인 테스트

### Jarvis
- [ ] 통합 테스트 스크립트
- [ ] E2E 테스트: 슬랙 멘션 → AI 응답 → 슬랙 게시
- [ ] 문서/README 업데이트

## 선행 조건
- [x] slack-bridge 코어 완성 (Auth, Client, Bridge, RTM)
- [x] 슬랙 로그인 + 토큰 추출 성공
- [x] chat.postMessage 동작 확인
- [ ] OpenClaw 플러그인 API 리서치 완료
- [ ] VISION의 슬랙 user ID 확인

## 마일스톤
1. **M1**: OpenClaw connector + outbound handler 구현
2. **M2**: 슬랙 @멘션 → AI 응답 동작 (수동 테스트)
3. **M3**: 자동 시작 + 에러 핸들링 + 재연결
4. **M4**: 스레드, 리액션, 파일 지원
