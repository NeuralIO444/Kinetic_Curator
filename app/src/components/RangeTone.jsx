// <RangeTone tone="build"> — every RangeRow inside takes the panel's thumb color (#1027).
// No DOM: it only provides the tone. See rangeTones.js and RangeRow.jsx.
import { RangeToneContext } from './rangeTones.js';

export function RangeTone({ tone, children }) {
  return <RangeToneContext.Provider value={tone}>{children}</RangeToneContext.Provider>;
}
