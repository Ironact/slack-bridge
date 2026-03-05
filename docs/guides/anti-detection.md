# Anti-Detection & Human-Like Behavior Guide

# 탐지 회피 및 자연스러운 사용 가이드

> slack-bridge operates under a real user account. To minimize the risk of
> Slack flagging or suspending the account, follow these guidelines.
>
> slack-bridge는 실제 사용자 계정으로 동작합니다. Slack이 계정을 감지하거나
> 정지하는 리스크를 줄이려면 아래 가이드를 따르세요.

## Why This Matters / 왜 중요한가

Slack monitors for abnormal usage patterns:
- Unusual login locations or IP changes / 비정상적 로그인 위치·IP 변경
- 24/7 continuous activity (humans sleep) / 24시간 연속 활동 (사람은 잠을 잔다)
- Machine-like uniform message intervals / 기계적으로 일정한 메시지 간격
- Unusual User-Agent strings / 비정상적 User-Agent
- Bulk API calls in short bursts / 짧은 시간에 대량 API 호출

## Guidelines / 가이드라인

### 1. Rate Limits — Be Conservative / 보수적으로

| Action | Recommended Limit | Slack Tier |
|--------|-------------------|------------|
| Messages (per channel) | **1/sec** max | Tier 3-4 |
| API calls (global) | **40/min** max | Mixed |
| `conversations.history` | **50/min** | Tier 3 |
| `users.info` | **20/min** | Tier 2 |
| `search.messages` | **20/min** | Tier 2 |
| File uploads | **20/min** | Tier 2 |

**Never** burst hundreds of requests. Spread them out.

**절대** 수백 건을 한번에 보내지 마세요. 분산하세요.

### 2. Human-Like Timing / 사람처럼 행동

```typescript
// ❌ Bad: Fixed intervals
setInterval(() => sendMessage(), 5000);

// ✅ Good: Random jitter
function humanDelay(baseMs: number): number {
  const jitter = baseMs * 0.3 * (Math.random() - 0.5); // ±15%
  return baseMs + jitter;
}
```

**Recommendations / 권장사항:**
- Add random delay (±15-30%) between API calls / API 호출 사이에 랜덤 딜레이
- Don't send messages at perfectly regular intervals / 완벽히 일정한 간격으로 보내지 말 것
- Vary response times (instant replies are suspicious) / 응답 시간을 다양하게

### 3. Activity Hours / 활동 시간대

```bash
# Optional: Limit activity to business hours
ACTIVITY_HOURS_START=09    # 9 AM
ACTIVITY_HOURS_END=23      # 11 PM
ACTIVITY_TIMEZONE=Asia/Seoul
```

A real human doesn't send messages at 4 AM every day. Consider limiting
active hours, or at minimum reducing activity during off-hours.

실제 사람은 매일 새벽 4시에 메시지를 보내지 않습니다.
활동 시간을 제한하거나, 최소한 오프 시간에는 활동을 줄이세요.

### 4. User-Agent / 사용자 에이전트

slack-bridge uses a standard Chrome User-Agent by default (via Playwright).
**Do not** change it to a custom string.

slack-bridge는 기본적으로 표준 Chrome User-Agent를 사용합니다 (Playwright 기본값).
커스텀 문자열로 변경하지 **마세요**.

### 5. Network Consistency / 네트워크 일관성

- Use the same IP/location consistently / 같은 IP·위치를 일관되게 사용
- Avoid VPN switches during sessions / 세션 중 VPN 전환 금지
- If using a server, pick a location near the user's usual location / 서버 사용 시 사용자의 평소 위치 근처 선택

### 6. Don't Bulk-Fetch / 대량 조회 금지

```typescript
// ❌ Bad: Fetch all users at startup
const allUsers = await client.users.list(); // Token invalidation risk!

// ✅ Good: Lazy load on demand
const user = await userCache.get(userId); // Single user, cached 1hr
```

Aggressive data fetching (all users, all channels, all messages) is the
#1 cause of xoxc- token invalidation. Always use lazy loading.

공격적 데이터 조회는 xoxc- 토큰 무효화의 **#1 원인**입니다.
항상 lazy loading을 사용하세요.

### 7. Dedicated Account / 전용 계정

**Strongly recommended**: Use a dedicated Slack account for slack-bridge,
not your personal account. If the account gets flagged, it won't affect
your personal workspace access.

**강력 권장**: 개인 계정이 아닌 전용 Slack 계정을 사용하세요.
계정이 감지되어도 개인 접근에 영향이 없습니다.

## What Slack Monitors / Slack이 감시하는 것

Based on public information and observed behavior:

| Signal | Risk Level | Mitigation |
|--------|-----------|------------|
| Login from new IP/country | Medium | Use consistent IP |
| 24/7 activity with no idle | High | Set activity hours |
| Machine-like message timing | Medium | Add jitter |
| Bulk API calls (users.list, etc.) | High | Lazy loading only |
| Unusual User-Agent | Low | Use Playwright defaults |
| Multiple concurrent sessions | Low | Single session recommended |
| Rapid channel switching | Low | Natural pacing |

## Environment Variables / 환경 변수

```bash
# Anti-detection settings
HUMAN_JITTER_PERCENT=20            # Random delay ±20%
HUMAN_MIN_DELAY_MS=100             # Minimum delay between API calls
ACTIVITY_HOURS_ENABLED=false       # Enable activity hour limits
ACTIVITY_HOURS_START=9             # Start hour (24h)
ACTIVITY_HOURS_END=23              # End hour (24h)
ACTIVITY_TIMEZONE=Asia/Seoul       # Timezone for activity hours
```

## Summary / 요약

**The golden rule: If a human wouldn't do it, don't let slack-bridge do it.**

**황금률: 사람이 안 할 행동이라면, slack-bridge도 하게 하지 마세요.**
