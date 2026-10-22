// 読み下しの読み上げ（ブラウザの音声合成）
export const RATES = [0.75, 1.0, 1.3];
export const RATE_LABEL = ["ゆっくり", "ふつう", "はやい"];

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function jaVoice(): SpeechSynthesisVoice | undefined {
  return speechSynthesis.getVoices().find((v) => v.lang.startsWith("ja"));
}

/** 記号を読み上げやすい言葉に置きかえる */
export function speakable(text: string): string {
  return text
    .replace(/"/g, "")
    .replace(/__init__/g, "イニット")
    .replace(/_/g, " ")
    .replace(/\{\}/g, "なみかっこ")
    .replace(/\*/g, "かける")
    .replace(/%/g, "パーセント");
}

export function speak(text: string, rateIdx: number): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak()) return resolve();
    const u = new SpeechSynthesisUtterance(speakable(text));
    u.lang = "ja-JP";
    const v = jaVoice();
    if (v) u.voice = v;
    u.rate = RATES[rateIdx] ?? 1;
    // 端末によっては終わりの知らせが来ないので、長さに合わせた時間で先へ進める
    const limit = window.setTimeout(resolve, 1500 + (u.text.length * 260) / u.rate);
    const done = () => {
      clearTimeout(limit);
      resolve();
    };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (canSpeak()) speechSynthesis.cancel();
}
