// The slider's two choices (#1027), kept out of RangeRow.jsx so that file only exports components.
// tone is the thumb COLOR per panel; layout is the SHAPE of the control. Neither changes behavior.
import { createContext } from 'react';

export const RANGE_TONES = Object.freeze(['ink', 'build', 'stim']);
export const RANGE_LAYOUTS = Object.freeze(['row', 'stack', 'bare']);

/**
 * The panel's tone, inherited by every RangeRow inside it: BUILD is 'build', STIMULI is 'stim', and
 * everywhere else it stays 'ink'. A RangeRow's own `tone` prop wins. Provided by <RangeTone>.
 */
export const RangeToneContext = createContext('ink');

/** Thumb colors, mirrored in controls.css (--range-thumb) and docs/DESIGN_SYSTEM.md §1.1. */
export const RANGE_TONE_COLORS = Object.freeze({ ink: '#e8e8e0', build: '#ffd400', stim: '#00d9ff' });
