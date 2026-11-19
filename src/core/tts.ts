/**
 * 语音能力封装（P4）：TTS 朗读 + ASR 语音输入。
 * 起步用浏览器内置 Web Speech API——零依赖、免费；服务商 TTS 留作扩展点。
 * Node/测试环境下所有能力自动降级为 no-op。
 */

/** 是否支持语音合成 */
export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** 是否支持语音识别（目前主要是 Chrome/Edge） */
export function asrSupported(): boolean {
  return typeof window !== "undefined" && !!(window as { SpeechRecognition?: unknown }).SpeechRecognition
    || (typeof window !== "undefined" && !!(window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
}

/** 挑一个中文语音（按 zh 优先） */
function chineseVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang.toLowerCase().startsWith("zh")) ?? voices[0] ?? null;
}

/** 朗读一段文本（会打断上一次朗读）。文本会做轻量去 Markdown。 */
export function speak(text: string, opts?: { lang?: string }): void {
  if (!ttsSupported() || !text.trim()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(
    text
      .replace(/```[\s\S]*?```/g, "（代码）")
      .replace(/[`*_#>~]/g, "")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .slice(0, 600),
  );
  const voice = chineseVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = opts?.lang ?? "zh-CN";
  utterance.rate = 1;
  synth.speak(utterance);
}

/** 停止朗读 */
export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

/** 停止函数：调用后结束监听 */
type StopListening = () => void;

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

/**
 * 开始语音识别。onFinal 收到逐段确定的文本（追加式），
 * onDone 在结束/出错时回调（出错带错误消息）。
 * 返回停止函数；不可用环境返回 no-op。
 */
export function listen(onFinal: (text: string) => void, onDone: (error?: string) => void): StopListening {
  if (!asrSupported()) {
    onDone("当前浏览器不支持语音输入");
    return () => undefined;
  }
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) {
    onDone("当前浏览器不支持语音输入");
    return () => undefined;
  }
  const recognition = new Ctor();
  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    for (let i = 0; i < event.results.length; i += 1) {
      const alternative = event.results[i]?.[0];
      const transcript = alternative?.transcript;
      if (transcript) onFinal(transcript.trim());
    }
  };
  recognition.onerror = () => onDone("语音识别出错了");
  let stopped = false;
  recognition.onend = () => {
    if (!stopped) onDone();
  };
  try {
    recognition.start();
  } catch {
    onDone("无法启动语音识别");
    return () => undefined;
  }
  return () => {
    stopped = true;
    try {
      recognition.stop();
    } catch {
      // ignore
    }
  };
}
