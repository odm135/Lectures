// ================================
// Utility
// ================================
const $ = (sel) => document.querySelector(sel);
const pad = (n) => n.toString().padStart(2, "0");

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

// ================================
// Elements
// ================================
const useAICheck = $("#useAI");
const aiSettings = $("#aiSettings");
const epInput = $("#apiEndpoint");
const modelInput = $("#modelName");
const keyInput = $("#apiKey");

const btnNew = $("#btnNew");
const btnStart = $("#btnStart");
const btnReset = $("#btnReset");

const promptText = $("#promptText");
const typing = $("#typingArea");
const bar = $("#progressBar");

const statWpm = $("#statWpm");
const statAcc = $("#statAcc");
const statTime = $("#statTime");
const statErr = $("#statErrors");

// Show/hide AI settings
useAICheck.addEventListener("change", () => {
  aiSettings.classList.toggle("hidden", !useAICheck.checked);
});

// Initial sensible defaults
epInput.value = "https://api.openai.com/v1/responses";
modelInput.value = "gpt-4o-mini";

// ================================
// Prompt Generation
// ================================

// Lightweight JP sentence templates as fallback
const SUBJECTS = ["猫", "朝の散歩", "小さな喫茶店", "新しい習慣", "静かな図書館", "週末の計画", "雨上がりの空", "通勤電車", "緑のノート", "忘れかけたメロディー"];
const ACTIONS  = ["見つけた", "始めた", "思い出した", "続けている", "寄り道した", "書き留めた", "聞こえてきた", "待っていた", "気がついた", "深呼吸した"];
const TAILS    = ["小さな幸せ。", "ゆっくり進もう。", "今日のごほうび。", "静かな決意。", "きっと大丈夫。", "背伸びの一歩。", "偶然の出会い。", "心が軽くなる。", "窓辺の光。", "次はあなたの番。"];

function localGenerateSentence() {
  // 20〜60文字程度の日本語短文
  const s = SUBJECTS[Math.random()*SUBJECTS.length|0];
  const a = ACTIONS[Math.random()*ACTIONS.length|0];
  const t = TAILS[Math.random()*TAILS.length|0];
  let sentence = `${s}について${a}瞬間、${t}`;
  if (sentence.length < 20) sentence = `${s}を思い浮かべて${a}朝、${t}`;
  if (sentence.length > 60) sentence = sentence.slice(0, 56) + "。";
  return sentence;
}

// OpenAI Responses API → fallback to Chat Completions if needed
async function fetchAISentence({ endpoint, model, apiKey }) {
  const sys = "あなたは日本語教師です。20〜60文字の自然な日本語の短文お題を1つだけ出力してください。句読点は1〜2個。改行・説明・番号は不要。";
  const user = "テーマは日常や自然、軽い気づきなど。例:『雨上がりの道で小さな虹を見つけた。』";
  // Try Responses API
  try {
    const res = await fetch(endpoint || "https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        input: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ],
        max_output_tokens: 100
      }),
    });
    if (!res.ok) throw new Error("Responses API error");
    const data = await res.json();
    // Try to read text safely across possible shapes
    const text =
      data.output?.[0]?.content?.[0]?.text ||
      data.output_text ||
      data.response?.output_text;
    if (text) return sanitizeOneLine(text);
    throw new Error("Unexpected responses payload");
  } catch (_) {
    // Fallback: Chat Completions (legacy)
    try {
      const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: user },
          ],
          max_tokens: 100,
          temperature: 0.7,
        }),
      });
      if (!res2.ok) throw new Error("Chat Completions API error");
      const data2 = await res2.json();
      const text = data2.choices?.[0]?.message?.content;
      if (text) return sanitizeOneLine(text);
      throw new Error("Unexpected chat payload");
    } catch (e) {
      console.warn("AI生成に失敗。ローカルにフォールバックします:", e.message);
      return localGenerateSentence();
    }
  }
}

function sanitizeOneLine(s) {
  return String(s).trim().split(/\r?\n/).map(x => x.trim()).filter(Boolean)[0].replace(/^["“”'『「]|["“”'』」]$/g, "");
}

// ================================
// Typing Engine
// ================================
let state = {
  prompt: "",
  startedAt: 0,
  timerId: null,
  typed: 0,
  correct: 0,
  errors: 0,
  finished: false,
};

function resetState() {
  state = { prompt: "", startedAt: 0, timerId: null, typed: 0, correct: 0, errors: 0, finished: false };
  typing.value = "";
  typing.setAttribute("disabled", "true");
  bar.style.width = "0%";
  statWpm.textContent = "0.0";
  statAcc.textContent = "100%";
  statTime.textContent = "00:00";
  statErr.textContent = "0";
  renderPrompt("");
}

function renderPrompt(currentInput) {
  const target = state.prompt;
  let html = "";
  const len = target.length;
  const pos = currentInput.length;
  for (let i = 0; i < len; i++) {
    const ch = target[i];
    if (i < pos) {
      const typedCh = currentInput[i];
      html += `<span class="${typedCh === ch ? "ok" : "bad"}">${escapeHtml(ch)}</span>`;
    } else if (i === pos && !state.finished) {
      html += `<span class="caret">${escapeHtml(ch)}</span>`;
    } else {
      html += `<span>${escapeHtml(ch)}</span>`;
    }
  }
  promptText.innerHTML = html;
  const progress = len ? Math.min(100, (pos / len) * 100) : 0;
  bar.style.width = `${progress}%`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m]));
}

function updateStats() {
  const elapsed = Date.now() - state.startedAt;
  const minutes = Math.max(elapsed / 60000, 1/60000);
  const wpm = (state.typed / 5) / minutes;
  const acc = state.typed ? (state.correct / state.typed) * 100 : 100;

  statWpm.textContent = wpm.toFixed(1);
  statAcc.textContent = `${Math.max(0, Math.min(100, acc)).toFixed(0)}%`;
  statTime.textContent = formatDuration(elapsed);
  statErr.textContent = String(state.errors);
}

function startTimer() {
  stopTimer();
  state.startedAt = Date.now();
  state.timerId = setInterval(updateStats, 100);
}

function stopTimer() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
}

// ================================
// Actions
// ================================
async function newPrompt() {
  resetState();
  // AI or Local
  const useAI = useAICheck.checked;
  let text = "";
  if (useAI) {
    const endpoint = epInput.value.trim() || "https://api.openai.com/v1/responses";
    const model = modelInput.value.trim() || "gpt-4o-mini";
    const apiKey = keyInput.value.trim();
    if (!apiKey) {
      alert("APIキーが未入力のため、ローカル生成に切り替えます。");
      text = localGenerateSentence();
    } else {
      text = await fetchAISentence({ endpoint, model, apiKey });
    }
  } else {
    text = localGenerateSentence();
  }
  state.prompt = text;
  renderPrompt("");
}

function beginTyping() {
  if (!state.prompt) {
    alert("まずは『新しいお題』をクリックしてください。");
    return;
  }
  typing.removeAttribute("disabled");
  typing.focus();
  state.finished = false;
  if (!state.startedAt) startTimer();
}

function resetAll() {
  resetState();
  promptText.innerHTML = "";
}

// ================================
// Listeners
// ================================
btnNew.addEventListener("click", newPrompt);
btnStart.addEventListener("click", beginTyping);
btnReset.addEventListener("click", resetAll);

typing.addEventListener("input", () => {
  if (!state.startedAt) startTimer();
  const input = typing.value;
  const target = state.prompt;
  state.typed = input.length;

  // Count correctness & errors
  let correct = 0;
  let errors = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === target[i]) correct++;
    else errors++;
  }
  state.correct = correct;
  state.errors = errors;

  renderPrompt(input);
  updateStats();

  if (input.length >= target.length) {
    state.finished = true;
    stopTimer();
    typing.setAttribute("disabled", "true");
  }
});

// First load
resetState();
newPrompt();
