// netlify/functions/whisper-transcribe.js
// 브라우저 MediaRecorder 오디오 → OpenAI Whisper API 한국어 전사
// 클라이언트에서 base64 JSON으로 전송 → 서버에서 Whisper API multipart 구성

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Whisper 환각(hallucination) 패턴
const HALLUCINATION_PATTERNS = [
  /^시청해\s?주셔서\s?감사합니다/,
  /^구독과?\s?(좋아요|댓글)/,
  /^MBC|^KBS|^SBS|^YTN|^JTBC/,
  /뉴스.{0,5}입니다\.?$/,
  /^감사합니다\.?$/,
  /^고맙습니다\.?$/,
  /^수고하셨습니다\.?$/,
  /^고마워요\.?$/,
  /^네,?\s*끝났습니다/,
  /^대학\s*상담/,
  /학생이\s*교수님/,
  /^Thank you/i,
  /^Subscribe/i,
  /^\s*$/,
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
    };
  }

  try {
    // 클라이언트에서 JSON { audio: "base64...", mimeType: "audio/webm" } 형태로 전송
    const payload = JSON.parse(event.body);
    const audioBuffer = Buffer.from(payload.audio, 'base64');
    const mimeType = payload.mimeType || 'audio/webm';

    console.log('[Whisper] 오디오 수신:', audioBuffer.length, 'bytes, type:', mimeType);

    if (audioBuffer.length < 1000) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Audio too short', text: '' }),
      };
    }

    // 파일 확장자 결정
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';

    // OpenAI Whisper API용 multipart/form-data 직접 구성
    const boundary = '----WhisperBoundary' + Date.now();
    const formParts = [];

    // file
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="audio.${ext}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
      'utf-8'
    ));
    formParts.push(audioBuffer);
    formParts.push(Buffer.from('\r\n', 'utf-8'));

    // model
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-1\r\n`,
      'utf-8'
    ));

    // language
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `ko\r\n`,
      'utf-8'
    ));

    // prompt — 짧게 (환각 방지 + 반복 방지)
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="prompt"\r\n\r\n` +
      `대학 상담 질문\r\n`,
      'utf-8'
    ));

    formParts.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));

    const requestBody = Buffer.concat(formParts);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: requestBody,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Whisper] API error:', response.status, errText);
      return {
        statusCode: response.status,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Whisper API error', details: errText, text: '' }),
      };
    }

    const result = await response.json();
    const rawText = (result.text || '').trim();
    console.log('[Whisper] 전사 결과:', rawText);

    // 환각 필터링
    const isHallucination = HALLUCINATION_PATTERNS.some(p => p.test(rawText));
    if (isHallucination) {
      console.log('[Whisper] 환각 필터링:', rawText);
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '', filtered: true }),
      };
    }

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: rawText }),
    };

  } catch (err) {
    console.error('[Whisper] 서버 오류:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message, text: '' }),
    };
  }
};
