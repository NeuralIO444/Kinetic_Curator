// WhisperLine — the deniable transition line (#1139).
//
// A single fading line of deadpan-warm lowercase copy. Renders nothing
// until a line is whispered for this slot, then fades out after a few
// seconds. No attribution, no name, no surface beyond the words.
import { useEffect, useState } from 'react';
import { onWhisper, STIMULI_KEYS, PLAY_KEYS } from '../curator/whisper.js';

const SLOT_KEYS = { stimuli: STIMULI_KEYS, play: PLAY_KEYS };

export function WhisperLine({ slot }) {
  const [line, setLine] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const keys = SLOT_KEYS[slot] || [];
    let timer = null;
    const off = onWhisper((key, text) => {
      if (!keys.includes(key)) return;
      setLine(text);
      setVisible(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 5000);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [slot]);

  if (!visible || !line) return null;
  return (
    <div className="whisper-line" aria-live="polite">
      {line}
    </div>
  );
}
