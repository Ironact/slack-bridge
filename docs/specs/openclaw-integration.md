# OpenClaw Integration Spec

## 목표
slack-bridge를 OpenClaw 채널 플러그인으로 연동하여, 슬랙에서 @멘션하면 AI가 자동 응답하는 구조 구현.

## 현재 상태
- ✅ slack-bridge: xoxc- 토큰으로 슬랙 메시지 송수신 가능
- ✅ RTM WebSocket으로 실시간 이벤트 수신 가능
- ✅ Bridge HTTP API (Fastify) 동작 중
- ❌ OpenClaw → slack-bridge 연동 없음
- ❌ 슬랙 메시지 수신 → AI 응답 파이프라인 없음

## 아키텍처

### Option A: OpenClaw 내장 Slack 채널 활용 (추천)
OpenClaw에 이미 Slack 채널 플러그인이 있음.
- 공식 Slack 앱 생성 (Socket Mode)
- xoxb- 봇 토큰 + xapp- 앱 토큰 사용
- OpenClaw config에서 `channels.slack` 활성화
- **장점**: 네이티브 지원, 스트리밍, 스레딩, 리액션 전부 동작
- **단점**: "봇 딱지" 붙음 (Slack 앱으로 인식)

### Option B: slack-bridge를 OpenClaw webhook으로 연결
slack-bridge RTM 수신 → webhook → OpenClaw system event
- slack-bridge가 RTM으로 메시지 수신
- @VISION 멘션 감지 시 OpenClaw에 webhook POST
- OpenClaw가 응답 생성
- 응답을 slack-bridge HTTP API로 전송하여 슬랙에 게시
- **장점**: 봇 딱지 없음, 사람 계정으로 대화
- **단점**: 커스텀 연동 필요, OpenClaw webhook 수신 설정 필요

### Option C: Hybrid (추천 최종안)
- **수신**: OpenClaw 내장 Slack 채널 (Socket Mode) — 안정적 이벤트 수신
- **송신**: slack-bridge (xoxc- 토큰) — 봇 딱지 없이 메시지 전송
- OpenClaw가 메시지 수신하면 AI가 응답 생성
- 응답을 slack-bridge API로 보내서 사람 계정으로 전송
- **장점**: 안정적 수신 + 봇 딱지 없는 송신

## 구현 계획

### Phase 1: OpenClaw 내장 Slack 채널 활성화
1. Slack 앱 생성 (Socket Mode)
   - Bot Token (xoxb-), App Token (xapp-)
   - 필요 스코프: chat:write, channels:history, im:history, app_mentions:read, etc
2. OpenClaw config에 channels.slack 추가
3. 테스트: 슬랙 DM → AI 응답 동작 확인

### Phase 2: slack-bridge 송신 연동
1. OpenClaw가 응답 시 slack-bridge API를 통해 전송하는 커스텀 훅
2. 또는 OpenClaw Slack 채널의 userToken에 xoxc- 토큰 설정 시도
   - `channels.slack.userToken`에 xoxc- 가능한지 검증
   - `userTokenReadOnly: false`로 쓰기 허용

### Phase 3: 완전 통합
1. 슬랙에서 @멘션 → AI 응답 (사람 계정으로)
2. 스레드, 리액션, 파일 전부 동작
3. 텔레그램 + 슬랙 동시 운영

## 환경 변수 (예상)
```bash
# OpenClaw Slack 채널
SLACK_APP_TOKEN=xapp-...
SLACK_BOT_TOKEN=xoxb-...

# slack-bridge (사람 계정 송신용)
SLACK_BRIDGE_URL=http://localhost:3847
SLACK_BRIDGE_TOKEN=<bearer-token>
```

## 선행 작업
- [ ] Slack 앱 생성 (의성이가 Ironact 워크스페이스에서)
- [ ] Socket Mode 활성화 + 토큰 발급
- [ ] OpenClaw config 업데이트
- [ ] 테스트

## 참고
- OpenClaw Slack 채널 문서: /opt/homebrew/lib/node_modules/openclaw/docs/channels/slack.md
- slack-bridge repo: https://github.com/Ironact/slack-bridge
