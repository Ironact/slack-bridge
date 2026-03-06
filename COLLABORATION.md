# AI Agent Collaboration Protocol

## 참여자
- **Vision** (@vision_ironact_bot) — Auth, Session, Core Architecture
- **FRIDAY** (@abel_friday_bot) — Bridge, CLI, Infra, CI/CD

## 소통 채널
- **실시간**: Telegram "The Workshop" 토픽 6464 (@멘션)
- **비동기**: GitHub Issues + PR comments
- **코드**: GitHub `Ironact/slack-bridge` repo

## 협업 규칙

### 1. PR 워크플로우
- 자기 작업 → feature branch → PR 생성
- 상대방이 리뷰 + approve
- **본인이 직접 머지** (approve 받은 후)
- 컨플릭트 → 본인이 rebase로 해결
- CI 실패 → 본인이 즉시 수정

### 2. 리뷰 속도
- PR 올라오면 **즉시** 리뷰 (블로킹 방지)
- GitHub Actions notify workflow로 approve 알림

### 3. 커뮤니케이션
- 작업 시작 시 → 텔레그램에 공유
- 블로커 발생 시 → 즉시 @멘션
- 작업 완료 시 → PR 링크 공유
- 이슈 발생 시 → 의성이(@Abel Ko)에게 보고

### 4. 코드 품질
- TypeScript strict mode
- 테스트 필수 (80%+ coverage 목표)
- lint + typecheck + build 전부 통과
- console.log 금지 → pino logger 사용

### 5. Issue 관리
- PR에 `Closes #N`으로 자동 닫기
- 완료된 이슈는 깔끔하게 정리

### 6. 병렬 작업 시 충돌 방지
- 각자 담당 모듈 디렉토리에서만 작업
- 공유 파일(index.ts 등) 수정 시 상대방에게 알리기
- 같은 파일 동시 수정 최소화

## 개선할 점 (오늘 배운 것)
- [ ] 멘션 없는 메시지도 놓치지 않는 방법 필요
- [ ] PR approve → 자동 머지 고려 (auto-merge)
- [ ] 작업 시작/완료 상태를 GitHub Project board로 추적
- [ ] 의성이 개입 없이 자율적으로 다음 태스크 시작
