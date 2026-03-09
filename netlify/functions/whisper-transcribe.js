// netlify/functions/whisper-transcribe.js
// 브라우저 MediaRecorder 오디오 → OpenAI Whisper API 한국어 전사

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  // Preflight
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
    // Netlify Function은 body를 base64로 수신 (binary)
    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body);

    if (bodyBuffer.length < 1000) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Audio too short', text: '' }),
      };
    }

    // multipart/form-data 경계 파싱 — 브라우저 FormData에서 'file' 필드 추출
    const contentType = event.headers['content-type'] || '';
    let audioBuffer = bodyBuffer;
    let filename = 'audio.webm';

    if (contentType.includes('multipart/form-data')) {
      const parsed = parseMultipart(bodyBuffer, contentType);
      if (parsed) {
        audioBuffer = parsed.buffer;
        filename = parsed.filename || 'audio.webm';
      }
    }

    // OpenAI Whisper API 호출
    const boundary = '----WhisperBoundary' + Date.now();
    const formParts = [];

    // file part
    formParts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: audio/webm\r\n\r\n`
    );
    formParts.push(audioBuffer);
    formParts.push('\r\n');

    // model part
    formParts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-1\r\n`
    );

    // language part
    formParts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `ko\r\n`
    );

    // prompt part — Whisper 환각 방지, 맥락 유도
    formParts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="prompt"\r\n\r\n` +
      `차의과학대학교 경영학전공 상담 대화입니다. 학생이 교수님, 커리큘럼, 취업, AI, 복수전공 등에 대해 질문합니다.\r\n`
    );

    formParts.push(`--${boundary}--\r\n`);

    // Buffer 합치기
    const bodyParts = formParts.map(part =>
      typeof part === 'string' ? Buffer.from(part, 'utf-8') : part
    );
    const requestBody = Buffer.concat(bodyParts);

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

    // Whisper 환각(hallucination) 필터링
    const HALLUCINATION_PATTERNS = [
      /^시청해\s?주셔서\s?감사합니다/,
      /^구독과?\s?(좋아요|댓글)/,
      /^MBC|^KBS|^SBS|^YTN|^JTBC/,
      /뉴스.{0,5}입니다\.?$/,
      /^감사합니다\.?$/,
      /^고맙습니다\.?$/,
      /^수고하셨습니다\.?$/,
      /^고마워요\.?$/,
      /^Thank you/i,
      /^Subscribe/i,
      /^\s*$/,
    ];

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

/**
 * 간단한 multipart/form-data 파서 — 'file' 필드의 바이너리 추출
 */
function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(.+?)(?:;|$)/);
  if (!boundaryMatch) return null;

  const boundary = boundaryMatch[1].trim();
  const boundaryBuf = Buffer.from('--' + boundary);

  // 첫 번째 파트 찾기 (file 필드)
  const bufStr = buffer.toString('latin1');
  const parts = bufStr.split('--' + boundary);

  for (const part of parts) {
    if (part.includes('name="file"')) {
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;

      // filename 추출
      const headerStr = part.substring(0, headerEnd);
      const fnMatch = headerStr.match(/filename="(.+?)"/);
      const filename = fnMatch ? fnMatch[1] : 'audio.webm';

      // 바이너리 데이터 추출
      const dataStart = headerEnd + 4;
      const dataEnd = part.lastIndexOf('\r\n');
      const dataPart = part.substring(dataStart, dataEnd > dataStart ? dataEnd : undefined);

      return {
        buffer: Buffer.from(dataPart, 'latin1'),
        filename,
      };
    }
  }
  return null;
}
