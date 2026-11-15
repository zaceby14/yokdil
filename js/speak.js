// Telaffuz: speechSynthesis (en-GB, yoksa en-US)
export const canSpeak = () => typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';

function voice() {
  const vs = speechSynthesis.getVoices();
  return vs.find(v => v.lang === 'en-GB') || vs.find(v => v.lang === 'en-US') || vs.find(v => /^en/i.test(v.lang)) || null;
}

export function speak(text) {
  if (!canSpeak() || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voice();
    u.lang = v?.lang || 'en-GB'; if (v) u.voice = v;
    u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch {}
}
