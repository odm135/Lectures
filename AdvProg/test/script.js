import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0';

const btn = document.getElementById('gen');
const out = document.getElementById('out');

let generator = null;

async function ensurePipe() {
  if (generator) return generator;

  // モデル/ランタイムの取得設定（ブラウザ内のみ・キャッシュ有効）
  env.allowRemoteModels = true;
  env.useBrowserCache = true;

  // まずは確実に動く軽量モデル（英語）
  // 公式ドキュメントにもあるサンプルモデルです。
  // https://huggingface.co/Xenova/distilgpt2
  generator = await pipeline('text-generation', 'Xenova/distilgpt2'); // 安定
  return generator;
}

async function generate() {
  btn.disabled = true;
  out.textContent = '初回はモデルを読み込み中…（数十MB）';

  try {
    const pipe = await ensurePipe();
    const prompt = 'Write one short motivational sentence about typing practice: ';
    const result = await pipe(prompt, { max_new_tokens: 40, temperature: 0.9 });
    out.textContent = (result?.[0]?.generated_text || '').trim() || '(空の応答)';
  } catch (e) {
    console.error(e);
    out.textContent = '生成に失敗しました。ネットワークや拡張機能のブロックを確認してください。';
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('gen').addEventListener('click', generate);
