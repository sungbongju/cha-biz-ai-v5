# v5 Whisper API 마이그레이션 — 개발 문서

**작성일:** 2026-03-09
**버전:** v5 (Web Speech API → OpenAI Whisper API)

---

## 1. 마이그레이션 배경

### 문제점 (v4 Web Speech API)
- 아바타 스피커 음성이 마이크로 유입 → 잘못된 음성 인식
- 발화 중 interrupt 불가 (아바타 음성을 사용자 음성으로 오인)
- 이어폰 없이는 사실상 음성 대화 불가능
- 브라우저별 동작 차이 (Chrome만 지원)

### 해결 (v5 Whisper API)
- MediaRecorder + VAD(Voice Activity Detection)으로 오디오 녹음
- Netlify Function을 통해 OpenAI Whisper API로 서버 사이드 전사
- VAD 볼륨 임계값으로 아바타 스피커 음성 vs 사용자 직접 음성 구분
- 발화 중에도 VAD 감지 → interrupt 지원

---

## 2. 아키텍처

```
사용자 음성
  ↓
getUserMedia → AudioContext + AnalyserNode (VAD)
  ↓ (볼륨 > 임계값)
MediaRecorder (WebM/Opus)
  ↓ (무음 1.5초 → 자동 종료)
Blob → FormData
  ↓
Netlify Function (whisper-transcribe.js)
  ↓
OpenAI Whisper API (/v1/audio/transcriptions, model: whisper-1, lang: ko)
  ↓
텍스트 반환
  ↓
processUserInput(text) → GPT → TTS → 아바타 발화
```

---

## 3. 파일 구조

```
cha-biz-ai-v5/
├── public/
│   ├── index.html              ← Whisper 클라이언트 (Web Speech API 제거)
│   └── js/auth.js              ← 인증 (변경 없음)
├── netlify/
│   └── functions/
│       ├── whisper-transcribe.js  ← [신규] Whisper API 프록시
│       ├── openai-chat.js         ← GPT 채팅 (변경 없음)
│       ├── heygen-token.js        ← HeyGen 토큰 (변경 없음)
│       └── heygen-proxy.js        ← HeyGen 프록시 (변경 없음)
├── netlify.toml
└── package.json
```

---

## 4. 새 Netlify Function: whisper-transcribe.js

### 엔드포인트
`POST /.netlify/functions/whisper-transcribe`

### 요청
- Content-Type: `multipart/form-data`
- Body: `file` 필드에 오디오 Blob (WebM/Opus)

### 응답
```json
{ "text": "안녕하세요 경영학 전공 소개해주세요" }
```

### 에러
```json
{ "error": "Audio too short", "text": "" }
```

### 환경변수
- `OPENAI_API_KEY` — 기존 GPT와 동일 키 사용

---

## 5. 클라이언트 음성인식 시스템

### 상수
| 이름 | 값 | 설명 |
|------|-----|------|
| WHISPER_SILENCE_THRESHOLD | 0.015 | 무음 판단 볼륨 |
| WHISPER_VOICE_THRESHOLD | 0.03 | VAD 음성 시작 임계값 |
| WHISPER_SILENCE_DURATION | 1500ms | 무음 지속 시 녹음 종료 |
| WHISPER_MIN_RECORDING | 500ms | 최소 녹음 시간 |

### 함수 흐름
```
initWhisper()          ← 세션 시작 시 마이크 초기화
  ↓
startVAD()             ← 볼륨 감지 루프 (requestAnimationFrame)
  ↓ (volume > VOICE_THRESHOLD)
startWhisperRecording() ← MediaRecorder.start()
  ↓
monitorWhisperSilence() ← 무음 1.5초 감지
  ↓
stopWhisperRecording()  ← MediaRecorder.stop()
  ↓
sendToWhisper(blob)     ← Netlify Function 호출
  ↓
processUserInput(text)  ← 기존 GPT 파이프라인
  ↓
startVAD()             ← 다음 발화 대기
```

### Interrupt 흐름
```
startVAD() (아바타 발화 중에도 작동)
  ↓ (volume > VOICE_THRESHOLD)
interruptAvatar()      ← /v1/streaming.interrupt
  ↓
startWhisperRecording() ← 사용자 음성 녹음
  ↓ (이후 동일)
```

### 음성 상태 (setVoiceState)
| 상태 | UI 표시 | 트리거 |
|------|---------|--------|
| idle | (없음) | 세션 없음 / 종료 |
| listening | 듣고 있어요... 말씀하세요 | VAD 활성 |
| thinking | 생각하고 있어요... | Whisper 전사 중 / GPT 호출 중 |
| speaking | 답변하고 있어요 | 아바타 TTS 발화 중 |

---

## 6. v4 대비 변경사항

### 제거
- `SpeechRecognition` / `webkitSpeechRecognition` 전체
- `recognition` 변수 및 관련 이벤트 핸들러 (onstart, onresult, onerror, onend)
- `isListening` 변수
- `silenceTimer` (Web Speech API용)
- `initSpeechRecognition()` 함수

### 추가
- `whisper-transcribe.js` (Netlify Function)
- `initWhisper()` — getUserMedia + AudioContext + AnalyserNode
- `startVAD()` / `stopVAD()` — 볼륨 기반 음성 감지
- `startWhisperRecording()` / `stopWhisperRecording()` — MediaRecorder
- `monitorWhisperSilence()` — 무음 감지
- `sendToWhisper(blob)` — Netlify Function 호출
- `cleanupWhisper()` — 세션 종료 시 리소스 정리
- `getVolume()` — AnalyserNode 볼륨 계산

### 유지
- `processUserInput(text)` — 그대로 (텍스트 입력 받아서 GPT 호출)
- `interruptAvatar()` — 그대로
- `onSpeakingDone()` — 그대로 (발화 완료 → startListening → startVAD)
- `setVoiceState()` — 그대로
- ActiveSpeakersChanged 하트비트 방식 (800ms)
- 폴백 타이머

---

## 7. 비용
- Whisper API: $0.006/분
- 평균 발화 5초 ≈ $0.0005/건
- 100건/일 기준 → 월 $1.5 수준
- 기존 OPENAI_API_KEY에서 차감

---

## 8. 배포

### GitHub
- 레포: `sungbongju/cha-biz-ai-v5`
- v4 레포는 백업으로 유지 (변경 없음)

### Netlify
- 환경변수: `HEYGEN_API_KEY`, `OPENAI_API_KEY` (v4와 동일)
- 카카오 개발자 콘솔: v5 도메인 추가 필요

---

## 9. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-03-09 | v5 생성: Web Speech API → Whisper API 마이그레이션 |
