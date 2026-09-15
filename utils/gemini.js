const { GoogleGenAI } = require('@google/genai');
const pool = require('../db/index');

const MODEL = 'gemini-3.8-flash';
const TIMEOUT_MS = 15000;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    readable: { type: 'boolean' },
    final_score: { type: ['integer', 'null'] },
    event_type_guess: { type: 'string', enum: ['score_attack', 'score_attack_ex', 'seraph', 'unknown'] }
  },
  required: ['readable', 'final_score', 'event_type_guess']
};

const PROMPT = `これはスマートフォンRPGのスコアアタック系リザルト画面です。日本語版だけでなく繁体字・英語など他言語のクライアントの場合もあります。文字列の一致ではなく画面の意味・構造で判断してください。

1. final_score: 画面の一番下に一番大きく表示され、「ハイスコア更新」等の文言と並んでいる数値を読み取ってください（カンマを除いた整数）。この画面がスコアリザルト画面でない、または数値が読み取れない場合は readable を false にしてください。

2. event_type_guess: 画面のレイアウトを以下の基準で分類してください（ラベルの文字列ではなく構造で判断すること）。
   - score_attack: 上部の対象名が敵ボスの固有名詞で、ボーナス内訳が2項目ある（被弾なし系のボーナスと、ターン最大ダメージ系のボーナスの両方がある）
   - score_attack_ex: 上部の対象名が敵ボスの固有名詞で、ボーナス内訳が1項目のみ（ターン最大ダメージ系のボーナスだけ）
   - seraph: 上部の対象名がボスの名前ではなく演習・訓練の名称で、ターンクリア倍率が存在せず、下部に戦術カードのようなアイコン列がある
   - 上記のいずれにも自信を持って当てはまらない場合は unknown`;

async function isAiCheckEnabled() {
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key = 'ai_score_check_enabled'");
    return result.rows.length === 0 || result.rows[0].value === 'true';
  } catch {
    return true;
  }
}

// 何が起きても例外を投げない。呼び出し側は ok:false を「AIチェック不可（手動確認へ）」として扱う。
async function extractScoreResult(buffer, mimeType) {
  if (!process.env.GEMINI_API_KEY) return { ok: false, reason: 'no_api_key' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const ai = new GoogleGenAI({});
    const interaction = await ai.interactions.create({
      model: MODEL,
      input: [
        { type: 'text', text: PROMPT },
        { type: 'image', data: buffer.toString('base64'), mime_type: mimeType }
      ],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: RESPONSE_SCHEMA
      }
    }, { abortSignal: controller.signal });

    const parsed = JSON.parse(interaction.output_text);
    if (!parsed.readable || typeof parsed.final_score !== 'number') {
      return { ok: true, readable: false };
    }
    return {
      ok: true,
      readable: true,
      score: parsed.final_score,
      eventTypeGuess: parsed.event_type_guess || 'unknown'
    };
  } catch (err) {
    return { ok: false, reason: err.name === 'AbortError' ? 'timeout' : 'error' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { extractScoreResult, isAiCheckEnabled };
