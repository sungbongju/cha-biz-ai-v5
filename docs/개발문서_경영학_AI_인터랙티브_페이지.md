# 경영학전공 AI 인터랙티브 페이지 — 개발 문서

**작성일:** 2026-03-04
**최종 수정:** 2026-03-09
**버전:** v4 (Netlify 통합 — 아바타 직접 통합)

---

## 목차
1. [시스템 아키텍처](#1-시스템-아키텍처)
2. [기술 스택](#2-기술-스택)
3. [랜딩페이지 구조](#3-랜딩페이지-구조)
4. [인증 시스템 (auth.js)](#4-인증-시스템)
5. [아바타 시스템 (Direct Integration)](#5-아바타-시스템)
6. [API 명세](#6-api-명세)
7. [행동 추적 시스템](#7-행동-추적-시스템)
8. [설문조사 시스템](#8-설문조사-시스템)
9. [트러블슈팅](#9-트러블슈팅)
10. [배포 구조](#10-배포-구조)
11. [HeyGen 동시 접속 제한](#11-heygen-동시-접속-제한)
12. [교수진 정보](#12-교수진-정보)
13. [OG 메타태그](#13-og-메타태그-sns-공유-미리보기)
14. [마이크 정책](#14-마이크-정책)
15. [Google Forms 설문 (백업용)](#15-google-forms-설문-백업용)
16. [v3→v4 마이그레이션](#16-v3v4-마이그레이션)
17. [HeyGen Live Avatar 전환 가이드](#17-heygen-live-avatar-전환-가이드)
18. [변경 이력](#18-변경-이력)

---

## 1. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                   사용자 (브라우저)                    │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────▼─────────────┐
         │    Netlify (단일 프로젝트)   │
         │  ┌──────────────────────┐  │
         │  │ public/index.html    │  │
         │  │ 랜딩페이지 + 아바타   │  │
         │  │ (livekit-client CDN) │  │
         │  └─────────┬────────────┘  │
         │            │               │
         │  ┌─────────▼────────────┐  │
         │  │ Netlify Functions    │  │
         │  │ heygen-token.js      │──┼──► HeyGen API
         │  │ heygen-proxy.js      │  │    (api.heygen.com)
         │  │ openai-chat.js       │──┼──► OpenAI GPT-4o-mini
         │  └──────────────────────┘  │
         └────────────────────────────┘
                       │
         ┌─────────────▼─────────────┐
         │ 백엔드 API (PHP 5.4.45)    │
         │ aiforalab.com              │──► MySQL (business_db)
         └────────────────────────────┘
```

### 통신 흐름
1. **카카오 로그인**: 랜딩페이지 → Kakao SDK → 백엔드 API → DB
2. **아바타 연결**: 시작 버튼 → Netlify Function(heygen-token/proxy) → HeyGen API → LiveKit WebRTC
3. **대화**: 음성/텍스트 → Netlify Function(openai-chat) → GPT-4o-mini → HeyGen TTS 발화
4. **섹션 스크롤**: GPT 응답의 action:"navigate" → navigateToSection() 직접 호출
5. **행동 추적**: 랜딩페이지 → IntersectionObserver → 백엔드 log_batch API
6. **설문조사**: 랜딩페이지 → 백엔드 survey_submit API → DB

---

## 2. 기술 스택

| 구분 | 기술 | 비고 |
|------|------|------|
| 프론트엔드 | HTML/CSS/JS (바닐라) | 프레임워크 미사용, Netlify 배포 |
| 아바타 연결 | livekit-client CDN + 직접 API 호출 | SDK 패키지 없음 |
| 서버리스 | Netlify Functions (ES module) | heygen-token/proxy/openai-chat |
| AI (대화) | OpenAI GPT-4o-mini | temperature: 0, max_tokens: 400 |
| 음성 인식 | Web Speech API (Chrome) | ko-KR, continuous mode |
| 인증 | Kakao SDK v1 | JS Key: fc0a1313d895b1956f3830e5bf14307b |
| 백엔드 | PHP 5.4.45 | `??` 연산자 사용 불가 |
| DB | MySQL (business_db) | user: user2, pw: user2!! |
| 폰트 | Noto Sans KR + DM Serif Display | Google Fonts |
| 배포 | Netlify | 단일 프로젝트, 자동 배포 |

---

## 3. 랜딩페이지 구조

### 3.1 파일 위치
- **v4**: `cha-biz-ai-v4/public/index.html` + `public/js/auth.js`
- Netlify 배포 (GitHub Pages 아님)

### 3.2 디자인 시스템

**컬러 팔레트 (웜톤 통일)**
```css
--charcoal: #1c1c1c        /* 다크 배경 */
--cream: #f5f0e8            /* 라이트 배경 */
--gold: #c9a27e             /* 주요 액센트 */
--gold-dark: #a07850        /* 강조 */
--beige: #d4b896            /* 서브 액센트 */
--warm-white: #faf8f4       /* 밝은 배경 */
/* 강조 다크: #6b4c30 (다크 브라운) */
/* 네이비 사용 금지 — 웜톤 통일 */
```

**타이포그래피**
- Hero h1: `clamp(34px, 9vw, 60px)` — DM Serif Display
- 섹션 h2: `clamp(26px, 7vw, 44px)` — DM Serif Display
- 바디: 15px, Noto Sans KR 400, line-height 1.8
- 섹션 태그: 11px, letter-spacing 4px, uppercase

**반응형 브레이크포인트**
- `768px`: 태블릿 (그리드 → 1열)
- `640px`: 스탯 그리드 2열
- `440px`: 모바일 최적화

### 3.3 섹션 구조

| # | ID | 제목 | 배경 |
|---|-----|------|------|
| 0 | hero | Hero | charcoal |
| 1 | research | 교육목표 + 융합형 인재 (병합) | cream |
| 2 | curriculum | 커리큘럼 | charcoal |
| 3 | ai | 차별성 & 복수전공 | beige |
| 4 | careers | 취업 & 진로 | charcoal |
| 5 | career-detail | 5대 진로 상세 | beige |
| 6 | only-cha | 산학연병 강점 | charcoal |
| 7 | experience | 실전 경험 | cream |
| 8 | faq | FAQ | warm-white |
| 9 | footer | Footer/CTA | charcoal gradient |
| 10 | survey | 설문조사 | cream (숨김) |

> **변경 이력 (03-06):** goals 섹션과 research 섹션을 하나의 research 섹션으로 병합. 교육목표 3가지 + 벤 다이어그램 + 통계카드 + 교육특성 칩이 한 페이지에 표시.

### 3.4 인터랙션 기능

**스크롤 프로그레스 바**
```javascript
window.addEventListener('scroll', () => {
  const h = document.documentElement.scrollHeight - window.innerHeight;
  spBar.style.transform = 'scaleX(' + (window.scrollY / h) + ')';
});
```

**Reveal 애니메이션 (IntersectionObserver)**
- `.reveal` 클래스에 `threshold: 0.2` 관찰
- 진입 시 `.visible` 추가 → CSS transition 발동
- `.rv1`~`.rv5` 지연 클래스 (100ms 간격)

**카운터 애니메이션**
- `data-count` 속성의 목표값으로 0부터 카운트업
- 2초 동안 easing: `1 - (1-t)^3`
- 소수점 지원: `parseFloat` + `toFixed(1)`

**3D 카드 틸트**
```javascript
card.addEventListener('mousemove', e => {
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  card.style.transform = `perspective(600px) rotateX(${y*20}deg) rotateY(${x*-20}deg)`;
});
```

**FAQ 아코디언**
- `.open` 토글 → `max-height: 0` ↔ `scrollHeight`

**Nav Dots**
- 섹션별 IntersectionObserver → active dot 표시

### 3.5 시각적 다이어그램 (4종)

| 다이어그램 | 위치 | 기술 |
|-----------|------|------|
| 벤 다이어그램 | research | CSS absolute + border-radius 50% |
| 스텝 플로우 | curriculum | Flexbox + 연결선 |
| 콤보 테이블 | ai (복수전공) | CSS Grid + 뱃지 |
| 다이아몬드 허브 | only-cha | SVG line + absolute positioning |

### 3.6 PIP 아바타 컨테이너 (Direct Integration)

```html
<div id="heygen-pip-container" class="expanded">
  <div class="pip-video">
    <video id="avatarVideo" autoplay playsinline></video>
    <div class="avatar-placeholder" id="avatarPlaceholder">...</div>
  </div>
  <div class="pip-chat">
    <!-- 음성 상태, 시작/종료 버튼, 채팅 히스토리, 텍스트 입력 -->
  </div>
  <!-- 드래그 핸들 (.pdb), 최소화/닫기 버튼 -->
</div>
```

**v3 대비 변경:**
- iframe 제거 → `<video>` 엘리먼트로 직접 렌더링
- livekit-client CDN으로 WebRTC 연결
- 채팅 UI 내장 (pip-chat: 버블, 입력창)
- Netlify Functions로 API 프록시 (같은 도메인, CORS 없음)
- postMessage 불필요 → 함수 직접 호출

**기능:**
- 드래그 이동 (마우스/터치)
- 최소화 (120x68px) — 채팅 영역 자동 숨김
- 닫기: 아바타 세션 완전 종료 (closeSession 직접 호출)
- 다시 열기 토글
- 반응형: 모바일에서 280x158px

---

## 4. 인증 시스템

### 4.1 카카오 로그인 플로우

```
사용자 → 동의 체크 → 카카오 로그인 → Kakao SDK
→ 액세스 토큰 → Kakao API (/v2/user/me)
→ kakao_id, nickname, email 획득
→ POST /business-api/api.php (action: kakao_login)
→ JWT 토큰 + user 객체 반환
→ localStorage 저장 (business_token, business_user)
→ UI 업데이트 + 아바타에 USER_INFO 전송
```

### 4.2 세션 관리

**LocalStorage 키:**
```
business_token   — JWT 토큰
business_user    — 유저 객체 JSON
business_session — 세션 ID (sess_timestamp_random)
```

**세션 복원 (페이지 로드 시):**
1. localStorage에서 토큰/유저 읽기
2. `?action=verify&token=...`로 유효성 검증
3. 유효 → UI 복원 + 추적 시작 + 아바타 전송 (6초 후)
4. 무효 → 세션 삭제 + 로그인 모달 표시 (1초 후)

### 4.3 아바타 통신 (USER_INFO)

**AudioContext 정책 대응:**
```javascript
// 사용자 첫 클릭/탭/키입력 감지
document.addEventListener('click', onFirstInteraction, true);
document.addEventListener('touchstart', onFirstInteraction, true);
document.addEventListener('keydown', onFirstInteraction, true);

function sendUserInfoToAvatar(user, token) {
  if (!_userHasInteracted) {
    _pendingSendArgs = { user, token };  // 대기
    return;
  }
  doSendUserInfo(user, token);  // 즉시 전송
}
```

**중복 방지:**
- `_userInfoSent` 플래그 — 한 번만 전송
- 아바타 앱에서도 `userInfoRef.current` 체크로 중복 처리 방지
- 타이머 폴백: 5초 → 10초 → 18초 재시도 (AVATAR_READY 대기)

---

## 5. 아바타 시스템 (Direct Integration)

### 5.1 파일 구조 (v4 — Netlify 통합)
```
cha-biz-ai-v4/
├── public/
│   ├── index.html          ← 랜딩페이지 + 아바타 JS 통합
│   ├── js/auth.js          ← 인증
│   └── img/og-thumbnail.jpg
├── netlify/functions/
│   ├── heygen-token.js     ← HeyGen 세션 토큰 발급
│   ├── heygen-proxy.js     ← HeyGen streaming API 프록시
│   └── openai-chat.js      ← GPT 대화 + 섹션 라우팅 + TTS 후처리
├── netlify.toml
├── package.json
└── .env                    ← API 키 (Netlify 환경변수로 설정)
```

### 5.2 아바타 설정

```javascript
const AVATAR_CONFIG = {
  avatarId: "e2eb35c947644f09820aa3a4f9c15488",  // 교수님 아바타
};
// 세션 생성 시 추가 설정:
// quality: "medium", voice_id, emotion: "friendly", language: "ko"
// version: "v2", video_encoding: "H264"
```

### 5.3 대화 흐름

```
[음성 입력] → Web Speech API (ko-KR) → 텍스트 변환
→ POST /.netlify/functions/openai-chat { message, history }
→ GPT-4o-mini (SYSTEM_PROMPT + 대화 이력)
→ GPT 원문(발음 규칙 적용됨)
→ cleanForDisplay(원문) = reply (채팅 버블용, 자연스러운 텍스트)
→ applyTtsPostProcessing(원문) = ttsReply (TTS 발화용, 발음 최적화)
→ JSON { reply, ttsReply, action, tabId }
→ 채팅 버블: reply 표시 (AI, 차의과학대학교 등 자연 표기)
→ action=navigate? → navigateToSection(tabId) → scrollIntoView({block:'center'})
→ callProxy("/v1/streaming.task", { text: ttsReply }) → HeyGen TTS 발화
→ 발화 완료 감지: ActiveSpeakersChanged 이벤트 + 폴백 타이머
→ 완료 후 Web Speech 재개 (자동 음성인식)
```

### 5.4 섹션 기반 네비게이션

**route.ts 섹션 매핑 + 키워드 기반 navigate 폴백:**

GPT가 `action: "navigate"`를 반환하지 않아도, 질문에 섹션 키워드가 포함되면 강제로 navigate 처리.

```typescript
const SECTION_INFO = {
  research:       { keywords: ["연구", "바이오", "헬스케어", "교육목표", "소개해", "어떤 전공", ...] },
  curriculum:     { keywords: ["커리큘럼", "수업", "과목", "학년", "캡스톤", "자격증", "배우나", ...] },
  ai:             { keywords: ["차별성", "복수전공", "달라", "다른 대학", "차이", "특별", ...] },
  faculty:        { keywords: ["교수", "교수님", "교수진", "김주헌", "김억환", "박대근", ...] },
  careers:        { keywords: ["취업", "취업률", "졸업하면", "취직", "대기업", ...] },
  "career-fields":{ keywords: ["진로", "진로분야", "경영기획", "마케팅", "직업", "분야", ...] },
  "only-cha":     { keywords: ["차대", "차병원", "강점", "장점", "산학연병", "뭐가 좋", ...] },
  experience:     { keywords: ["팀플", "해커톤", "창업", "경진대회", "활동", "프로그램", ...] },
  faq:            { keywords: ["수학", "수포자", "걱정", "괜찮을까", "못해도", ...] },
};

// 폴백 로직: GPT가 none 반환 + 질문에 키워드 포함 → 가장 긴 키워드 매칭 섹션으로 강제 navigate
// 인사/잡담("안녕", "고마워", "감사" 등)은 제외
```

**랜딩페이지 수신 (구 tab ID 호환):**
```javascript
var _tabToSection = {
  tab1:'research', tab2:'curriculum', tab3:'careers', tab4:'ai',
  tab5:'ai', tab6:'experience', tab7:'research', tab8:'only-cha',
  tab9:'careers', tab10:'careers', tab11:'only-cha', tab12:'ai',
  tab13:'faq', tab14:'faq'
};
```

### 5.5 통신 방식 (v4 — postMessage 제거)

v4에서는 아바타가 같은 페이지에 통합되어 postMessage가 불필요합니다.

| 기능 | v3 (iframe) | v4 (직접 통합) |
|------|-------------|----------------|
| 섹션 스크롤 | NAVIGATE_TAB postMessage | `navigateToSection(tabId)` 직접 호출 |
| 세션 시작 | START_AVATAR postMessage | `startSession()` 직접 호출 |
| 세션 종료 | CLOSE_AVATAR postMessage | `closeSession()` 직접 호출 |
| 사용자 정보 | USER_INFO postMessage | `window._avatarUserInfo` 전역 변수 |
| 대화 요청 | ASK_QUESTION postMessage | `processUserInput(text)` 직접 호출 |

### 5.6 음성 인식 오류 대응 (SYSTEM_PROMPT)

```
"조수진" / "고수진" → 교수진
"취엄" → 취업
"복수정공" / "복스전공" → 복수전공
"해커쏜" / "핵커톤" → 해커톤
"캡스턴" / "켑스톤" → 캡스톤
"커리큘렘" → 커리큘럼
```
→ 문맥 추론으로 가장 가까운 경영학 관련 주제로 해석

### 5.7 TTS 발음 규칙

**4단계 발음 최적화 (프롬프트 → 후처리 → 조사 분리 → 채팅 버블 역변환)**

**① 프롬프트 규칙**: GPT에게 합성어 띄어쓰기, 영어 약어 한글화, 해요체 강제 지시
**② 후처리 강제 치환** (`applyTtsPostProcessing`): GPT가 규칙 미준수 시에도 강제 치환
**③ 합성어+조사 자동 분리**: 정규식으로 30개 합성어 뒤 조사를 자동 띄어쓰기
**④ 채팅 버블 역변환** (`cleanForDisplay`): 발음 텍스트를 자연스러운 표시용으로 역변환
  - 한글 발음 → 영어 약어 복원 (에이아이→AI, 케이피엠지→KPMG 등)
  - 불필요한 띄어쓰기 복원 (차 의과학 대학교→차의과학대학교 등)
  - 퍼센트→% 복원

```
// ② 후처리 치환 목록
"차의과학대학교" → "차 의과학 대학교" (3단어 분리)
"헬스케어융합학부" → "헬스케어 융합 학부"
"미래융합대학" → "미래 융합 대학"
"경영학전공" → "경영학 전공"
"기술경영" → "기술 경영", "조직행동론" → "조직 행동론"
"경영학원론" → "경영학 원론", "캡스톤디자인" → "캡스톤 디자인"
"투자자산운용" → "투자 자산 운용", "기업지배구조" → "기업 지배 구조"
AI → "에이아이", R&D → "알앤디", ESG → "이에스지"
IT → "아이티", IR → "아이알", PR → "피알", CR → "씨알"
CRM → "씨알엠", CDO → "씨디오", VC → "브이씨"
ADsP → "에이디에스피", SQLD → "에스큐엘디", RISE → "라이즈"
88% → "88 퍼센트"
"차병원" → "차 병원", "차병원그룹" → "차 병원 그룹"

// ③ 합성어+조사 자동 분리 (정규식)
대상 합성어: 경영학, 헬스케어, 캡스톤, 마케팅, 경영기획, 회계재무,
  액션러닝, 복수전공, 비즈니스, 빅데이터, 스타트업, 차의과학대 등 30개
대상 조사: 은/는/이/가/을/를/의/에/에서/으로/로/만/만의/과/와/도/까지/부터 등
예: "경영학은" → "경영학 은", "헬스케어만의" → "헬스케어 만의"
```

**SECTION_SCRIPTS 발음 최적화:**
탭 설명용 하드코딩 스크립트(7개 섹션)는 후처리 대상이 아니므로, 스크립트 자체에 직접 띄어쓰기 적용.
예: "경영기획은" → "경영 기획 은", "액션러닝으로" → "액션 러닝 으로"

### 5.8 Netlify Functions 보안

- Netlify Functions는 같은 도메인에서 호출되므로 CORS 이슈 없음
- 환경변수(HEYGEN_API_KEY, OPENAI_API_KEY)는 Netlify 대시보드에서 설정
- heygen-proxy.js는 화이트리스트 엔드포인트만 프록시 (streaming.new/start/task/interrupt/stop)

---

## 6. API 명세

### 6.1 백엔드 API (PHP)

**Base URL:** `https://aiforalab.com/business-api/api.php`

| Action | Method | 요청 | 응답 |
|--------|--------|------|------|
| kakao_login | POST | `{kakao_id, nickname, email}` | `{success, token, user}` |
| verify | GET | `?token=...` | `{success, valid}` |
| user_history | GET | `?user_id=...` | `{visit_count, recent_topics, ...}` |
| log_batch | POST | `{token, events[]}` | `{success}` |
| survey_submit | POST | `{satisfaction, reason, grade, gender, ...}` | `{success, id}` |
| save_chat | POST | `{message, response, session_id}` | `{success}` |

### 6.2 Netlify Functions API

| 엔드포인트 | Method | 요청 | 응답 |
|-----------|--------|------|------|
| /.netlify/functions/openai-chat | POST | `{message, history}` | `{reply, ttsReply, action, tabId}` |
| /.netlify/functions/openai-chat | POST | `{type:"tab_explain", tabId}` | `{reply, ttsReply}` (고정 스크립트) |
| /.netlify/functions/heygen-token | POST | (없음) | `{data:{token}}` |
| /.netlify/functions/heygen-proxy | POST | `{endpoint, token, payload}` | HeyGen API 응답 프록시 |

### 6.3 환경 변수 (Netlify 대시보드에서 설정)

```env
HEYGEN_API_KEY=<비공개>
OPENAI_API_KEY=<비공개>
```

---

## 7. 행동 추적 시스템

### 7.1 추적 이벤트

| 이벤트 | 트리거 | 메타데이터 |
|--------|--------|-----------|
| section_view | 섹션 2초 이상 체류 후 이탈 | `{duration_seconds}` |
| scroll_depth | 10% 단위 스크롤 | `{depth_percent}` |
| cta_click | CTA 버튼 클릭 | `{button_text}` |
| tab_click | 탭/버튼 클릭 | `{button_text}` |
| page_total | 페이지 이탈 시 | `{total_seconds}` |

### 7.2 전송 방식

- 5개 이벤트마다 `fetch` POST 배치 전송
- 페이지 이탈 시 `navigator.sendBeacon` 사용 (전달 보장)
- 로그 형식: `{event_type, section_id, session_id, metadata, timestamp}`

---

## 8. 설문조사 시스템

### 8.1 설문 항목

- **만족도** (satisfaction): 1~5 Likert (매우 불만족~매우 만족)
- **방문 이유** (reason): 복수 선택 칩
- **학년** (grade): 1~5 Likert
- **성별** (gender): 선택
- **MBTI** (선택): 텍스트 입력
- **자유 의견** (feedback): 텍스트 입력

### 8.2 제출 플로우

```javascript
function submitSurvey() {
  // 필수 항목 검증 (만족도, 이유, 학년, 성별)
  // POST → api.php?action=survey_submit
  // 성공 → localStorage('survey_submitted') 저장
  // 중복 제출 방지
}
```

---

## 9. 트러블슈팅

### 9.1 아바타가 안 뜨는 경우

| 원인 | 해결 |
|------|------|
| HeyGen API 토큰 발급 실패 | Netlify 환경변수 확인, 페이지 새로고침 |
| LiveKit 연결 실패 | 네트워크 확인, 방화벽 WebRTC 포트 확인 |
| 동시 접속 제한 초과 | 자동 큐잉 (아래 11장 참조) |

### 9.2 아바타 발화 완료 감지

| 원인 | 해결 |
|------|------|
| v4에서는 인사말이 세션 시작 시 자동 발화 | startSession() 내 greetingTTS 하드코딩 |
| "답변하고 있어요" 계속 표시 | ActiveSpeakersChanged 이벤트 + 폴백 타이머 이중 감지 |
| ActiveSpeakersChanged 이벤트 미발생 시 | 폴백 타이머: `(글자수/4)*1000+3000`ms 후 자동 상태 해제 |
| 발화 중 새 질문 시 | `interruptAvatar()` → streaming.interrupt API 호출 후 새 질문 처리 |
| 세션 끊김 | RoomEvent.Disconnected 감지 → 전체 상태 리셋 + 시작 버튼 활성화 |

### 9.3 스크롤 관련

| 원인 | 해결 |
|------|------|
| 모바일 스크롤 멈춤 | PIP 드래그 touchmove를 dragging 중에만 preventDefault |
| 답변 후 섹션 스크롤 안 됨 | navigateToSection() + _tabToSection 매핑 (v4에서는 직접 호출) |

### 9.4 음성 인식 오류

| 원인 | 해결 |
|------|------|
| Web Speech API 오인식 | SYSTEM_PROMPT에 유사 발음 매핑 규칙 추가 |
| 전문 용어 인식 실패 | GPT에게 문맥 추론 지시 ("절대 알 수 없습니다로 답하지 마세요") |
| 근본 해결 | Azure Speech (5시간/월 무료) 또는 Whisper API로 교체 검토 |

### 9.5 카카오 로그인

| 원인 | 해결 |
|------|------|
| 카카오톡 인앱 브라우저 | Chrome으로 자동 리다이렉트 (Intent/scheme) |
| 토큰 URL 인코딩 | JWT의 `=` 문자 → `encodeURIComponent()` 사용 |
| 팝업 콜백 실패 | 1초 간격 토큰 폴링 (90초 타임아웃) |

---

## 10. 배포 구조

### 10.1 GitHub 레포

| 레포 | URL | 배포 | 비고 |
|------|-----|------|------|
| cha-biz-ai-v4 | github.com/sungbongju/cha-biz-ai-v4 | Netlify 자동 배포 | 랜딩+아바타 통합 |
| cha-biz-ai-v2 | github.com/sungbongju/cha-biz-ai-v2 | GitHub Pages | 이전 버전 |
| cha-biz-ai-v3 | github.com/sungbongju/cha-biz-ai-v3 | GitHub Pages | 이전 버전 |
| InteractiveAvatarNextJSDemo | github.com/sungbongju/InteractiveAvatarNextJSDemo | (폐기 예정) | v4로 통합 |

### 10.2 서버

| 서비스 | 주소 | 비고 |
|--------|------|------|
| 백엔드 API | aiforalab.com/business-api/api.php | PHP 5.4.45 |
| SSH | 106.247.236.2:10022 (user2/user2!!) | sudo 필요 |
| DB | business_db | MySQL |

### 10.3 CORS 허용 출처 (백엔드 PHP API)

```
sungbongju.github.io
sdkparkforbi.github.io
aiforalab.com
cha-biz-ai-v4.netlify.app  ✅ 추가 완료 (03-07)
localhost / 127.0.0.1
```

> **참고:** Netlify Functions는 같은 도메인이므로 CORS 불필요. 백엔드 PHP API만 새 Netlify 도메인 추가 필요.

---

## 11. HeyGen 동시 접속 제한

### 11.1 공식 답변 (HeyGen 지원팀, 2026-03-04)

> "Your app won't crash! The API has a built-in queuing system.
> If you exceed your plan's concurrency limit, additional videos are
> automatically queued and processed as capacity becomes available."

### 11.2 플랜별 동시 세션

| 플랜 | 동시 세션 | 비고 |
|------|----------|------|
| Trial | 1개 | 무료 |
| API 기본 | 3~6개 | 유료 |
| Enterprise | 최대 20개 | 협의 |

### 11.3 40명 동시 접속 시나리오

- 3~6명: 즉시 아바타 연결
- 나머지 34~37명: **자동 큐 대기** (크래시 없음)
- 대기자는 아바타가 로딩 중으로 표시됨
- 앞선 세션 종료 시 순서대로 연결

### 11.4 권장 대응

1. **설문 우선 진행**: 아바타 대기 중에도 설문 작성 가능하도록 구성
2. **시차 접속 유도**: 조별로 5~10명씩 시간차 접속
3. **플랜 확인**: 현재 API 플랜의 동시 세션 수 확인 필요

---

## 12. 교수진 정보

| 이름 | 전공 분야 | 직책 | 한 줄 경력 |
|------|----------|------|-----------|
| 김주헌 | 국제경영학 | 학장 | Indiana Univ. 박사, 前 KT 마케팅 연구실장, 융합과학대학 학장 |
| 김억환 | 인사조직, 경영전략 | 입학홍보처장 | Warwick 박사, Minnesota 석사, 한국경영교육학회 상임이사 |
| 김용환 | 기술경제, 국제경제, 연구윤리 | | 경희대 박사, 빅데이터인공지능연구소 소장, 前 KIST 연구정책실장 |
| 김태동 | 회계재무 | | 연세대 박사, 미국 CPA, 한국경영학회 부회장, 대한상공회의소 자문교수 |
| 박대근 | 재무금융 | 학과장 | KAIST 박사, 前 KPMG/Accenture 15년, 금융감독원 심사위원 |
| 이희정 | 마케팅, 관광심리, 서비스 | | Griffith Univ. 박사, 한국물류학회 편집위원장 |
| 김종석 | 기술경영, 혁신관리, 미래예측, 전략 | | Manchester 박사, NYU 석사, Emerald Literati Award 수상 |

---

## 13. OG 메타태그 (SNS 공유 미리보기)

```html
<!-- v4 (Netlify) -->
<meta property="og:title" content="경영학전공 — 차의과학대학교"/>
<meta property="og:description" content="AI × 바이오헬스케어 × 비즈니스 융합형 인재를 양성합니다."/>
<meta property="og:image" content="https://cha-biz-ai-v4.netlify.app/img/og-thumbnail.jpg"/>
<meta property="og:url" content="https://cha-biz-ai-v4.netlify.app/"/>
```

- 이미지: lc.cha.ac.kr 경영학전공 배너 이미지 사용
- 카카오톡/SNS 공유 시 제목+설명+썸네일 미리보기 표시

---

## 14. 마이크 정책

- **자동 시작**: 아바타 세션 시작 시 Web Speech API 자동 초기화 + 시작
- **권한 거부 시**: alert 없이 조용히 실패 (console.error만 출력)
- **마이크 없는 환경**: 텍스트 입력으로 대화 가능
- **상태 텍스트**: 마이크 켜짐 → "듣는 중... 말씀하세요", 꺼짐 → "텍스트로 질문하세요"
- **마이크 토글**: 버튼 클릭으로 on/off 가능

---

## 15. Google Forms 설문 (백업용)

40명 동시 접속 데모 시 랜딩페이지 설문과 동일한 Google Forms를 병행 운영.

| 문항 | 유형 | 설정 |
|------|------|------|
| AI 아바타 상담 만족도 | 선형 배율 1~5 | 매우 불만족 ~ 매우 만족 |
| 만족/불만족 이유 | 객관식 (단일) | 6개 선택지 |
| 학년 | 객관식 | 1~4학년, 기타 |
| 성별 | 객관식 | 남성, 여성 |
| MBTI | 단답형 | 직접 입력 |

> 응답 데이터는 Google Sheets로 수집 후, 서버 DB에 일괄 INSERT하여 랜딩페이지 설문 결과와 통합 가능.

---

## 16. v3→v4 마이그레이션

### 16.1 왜 v4를 만들었나?

| 문제 | v3 (분리) | v4 (통합) |
|------|-----------|-----------|
| 아키텍처 | GitHub Pages + Netlify 2개 분리 | Netlify 1개 통합 |
| 아바타 연결 | iframe + postMessage | 직접 livekit-client + API 호출 |
| SDK 의존성 | @heygen/streaming-avatar (npm) | SDK 없음, CDN만 사용 |
| Live Avatar 전환 | SDK 패키지 교체 + 코드 전면 수정 | API 도메인/엔드포인트만 변경 |
| CORS | iframe 크로스오리진 이슈 | 같은 도메인, 이슈 없음 |
| 배포 관리 | 2개 레포 동기화 필요 | 1개 레포 단일 배포 |

### 16.2 변경된 파일

| v3 | v4 | 변경 내용 |
|----|-----|----------|
| index.html | public/index.html | iframe PIP → 직접 비디오+채팅, livekit-client CDN 추가, 아바타 JS 통합 |
| js/auth.js | public/js/auth.js | iframe postMessage → 전역 변수 저장 |
| (별도 레포) route.ts | netlify/functions/openai-chat.js | Next.js API → Netlify Function, reply/ttsReply 분리 |
| (별도 레포) get-access-token/route.ts | netlify/functions/heygen-token.js | Next.js API → Netlify Function |
| 없음 | netlify/functions/heygen-proxy.js | HeyGen streaming API 프록시 (신규) |
| 없음 | netlify.toml | Netlify 빌드 설정 (신규) |
| 없음 | package.json | netlify-cli devDependency (신규) |

### 16.3 배포 절차

1. ✅ GitHub에 `cha-biz-ai-v4` 레포 생성 후 push
2. ✅ Netlify에서 레포 연결 → `cha-biz-ai-v4.netlify.app` 자동 배포
3. ✅ 환경변수 설정: `HEYGEN_API_KEY`, `OPENAI_API_KEY`
4. ✅ 백엔드 PHP API에 `cha-biz-ai-v4.netlify.app` CORS 추가
5. ✅ 카카오 개발자 콘솔:
   - 일반 → 플랫폼 → Web: `https://cha-biz-ai-v4.netlify.app` 사이트 도메인 추가
   - 카카오 로그인 → Redirect URI: `https://cha-biz-ai-v4.netlify.app` 추가

---

## 17. HeyGen Live Avatar 전환 가이드

### 17.1 현재 상태 (2026-03-07)

- **Interactive Avatar**: 2026-03-31 서비스 종료 (deprecated)
- **Live Avatar**: 신규 제품, 마이그레이션 필수
- 교수님: HeyGen API Pro 플랜, Live Avatar 베타 참여 중
- 우리: 마이그레이션 보류 (교수님과 상의 후 진행)

### 17.2 Live Avatar vs Interactive Avatar

| 항목 | Interactive Avatar (현재) | Live Avatar (신규) |
|------|--------------------------|-------------------|
| API 도메인 | `api.heygen.com` | `api.liveavatar.com` |
| SDK | `@heygen/streaming-avatar` | 새 SDK (미확인) |
| 엔드포인트 | `/v1/streaming.*` | 변경됨 |
| 모드 | 단일 | FULL (양방향) + LITE (단방향) |
| 가격 | 분당 비쌈 | 분당 더 저렴 |

### 17.3 v4에서 전환 시 변경 포인트

v4는 SDK 없이 직접 API 호출 구조이므로, 전환 시 변경이 최소화됩니다:

```
변경 파일: netlify/functions/heygen-token.js, heygen-proxy.js
변경 내용:
  - API 도메인: api.heygen.com → api.liveavatar.com
  - 엔드포인트 경로: /v1/streaming.* → (Live Avatar 엔드포인트)
  - 토큰 발급 방식: 동일하거나 유사할 것으로 예상

변경하지 않는 것:
  - index.html (livekit-client 그대로)
  - openai-chat.js (GPT 로직 그대로)
  - auth.js (인증 그대로)
```

### 17.4 마이그레이션 3단계 (공식 가이드)

1. **Phase 1 — Asset Copy**: HeyGen 아바타/음성 자산을 LiveAvatar로 복사
2. **Phase 2 — Subscription Transition**: 30일 무료 체험 후 LiveAvatar 구독 전환
3. **Phase 3 — Implementation Cutover**: API 도메인/엔드포인트 변경 (코드 수정)

### 17.5 주의사항

- 개별 음성(Individual Voice) 마이그레이션은 아직 미지원
- 교수님 코드(cha-ai-graduate)도 동일하게 Interactive Avatar 사용 중
- 두 프로젝트 동시 전환 권장

---

## 18. 변경 이력

| 날짜 | 내용 |
|------|------|
| 03-04 | 최초 작성 |
| 03-06 (오전) | 교수님 피드백 2차 반영: 회계·세무·금융→회계재무, goals+research 섹션 병합, experience 3칸 그리드, OG 메타태그 추가, 아바타 X→세션 종료, TTS 발음 후처리 대폭 확장, 마이크 자동시작+조용한 실패 처리, Google Forms 설문 병행 |
| 03-06 (오후) | SECTION_SCRIPTS 7개 섹션 발음 최적화 (합성어+조사 띄어쓰기), 키워드 기반 navigate 폴백 추가 (GPT가 none 반환해도 질문 키워드로 섹션 매칭), 섹션 키워드 보강 (자연어 질문 패턴: "달라", "다른 대학", "졸업하면" 등), GPT 자유응답 합성어+조사 자동 분리 정규식 추가 (30개 합성어 × 15개 조사), 대학원 페이지 채팅 버블/TTS 분리 적용 |
| 03-07 | **v4 생성**: Netlify 통합 아키텍처 (iframe 제거 → livekit-client 직접 통합), Netlify Functions 3개 (heygen-token/proxy, openai-chat), route.ts 전체 포팅, HeyGen Live Avatar 전환 가이드 추가, 배포 완료 (GitHub→Netlify 연결, 환경변수, CORS, 카카오 Redirect URI 설정) |
| 03-09 | 카카오 로그인 설정 완료 (Web 플랫폼 도메인 + Redirect URI). 아바타 발화 완료 감지 개선 (ActiveSpeakersChanged 이벤트 + 폴백 타이머 이중화). 아바타 말 끊기 기능 (streaming.interrupt API). 세션 끊김 감지 + 자동 복구 (RoomEvent.Disconnected). 교수진 7명 전원 정보 추가 (GPT 지식 + 랜딩페이지 카드 + 한 줄 경력). 회계세무→회계재무 수정. 습니다→해요체 강제 변환 (GPT 프롬프트 + 후처리). `cleanForDisplay()` 역변환 함수 추가 (채팅 버블에 자연스러운 텍스트 표시). `faculty` 섹션 + `career-fields` 섹션 분리 (교수진/5대 진로 정확한 스크롤 타겟). 섹션 스크롤 `block:'center'` 적용. 채팅 버블 `width:fit-content` 적용. |
