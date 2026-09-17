// TemplateEffectControls — generic FX panel controls for template effects.
//
// Renders entirely from the effect's param descriptor (see controlSpecs
// in ./template.mjs): adding a new effect never needs UI code. Native
// inputs only (range/checkbox/color) so the module stays dependency-free
// and Node-testable; the app FX panel may swap these for RangeRow later.
// Props: { descriptor, values, onChange(patch) }.
import { createElement } from 'react';
import { controlSpecs, sanitizeParams } from './template.mjs';

const toHex = ([r, g, b]) => {
  const h = (c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
};

const fromHex = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
};

function SliderRow({ spec, value, onChange }) {
  return createElement(
    'div',
    { className: 'range-row', title: spec.hint || undefined },
    createElement('span', { className: 'range-label' }, spec.label),
    createElement('input', {
      type: 'range',
      min: spec.min,
      max: spec.max,
      step: spec.step,
      value,
      'aria-label': spec.label,
      onChange: (e) => onChange({ [spec.name]: Number(e.target.value) }),
    }),
    createElement('span', { className: 'fx-param-readout' }, String(value)),
  );
}

function ToggleRow({ spec, value, onChange }) {
  return createElement(
    'label',
    { className: 'fx-param-toggle', title: spec.hint || undefined },
    createElement('input', {
      type: 'checkbox',
      checked: !!value,
      onChange: (e) => onChange({ [spec.name]: e.target.checked }),
    }),
    createElement('span', { className: 'range-label' }, spec.label),
  );
}

function ColorRow({ spec, value, onChange }) {
  return createElement(
    'label',
    { className: 'fx-param-color', title: spec.hint || undefined },
    createElement('span', { className: 'range-label' }, spec.label),
    createElement('input', {
      type: 'color',
      value: toHex(value),
      onChange: (e) => onChange({ [spec.name]: fromHex(e.target.value) }),
    }),
  );
}

export function TemplateEffectControls({ descriptor, values, onChange }) {
  const safe = sanitizeParams(descriptor, values);
  const rows = [];
  for (const spec of controlSpecs(descriptor)) {
    const value = safe[spec.name];
    const key = spec.name;
    if (spec.ui === 'toggle') {
      rows.push(createElement(ToggleRow, { key, spec, value, onChange }));
    } else if (spec.ui === 'color') {
      rows.push(createElement(ColorRow, { key, spec, value, onChange }));
    } else if (spec.type === 'vec2') {
      // vec2 params render as an X/Y slider pair.
      const [x, y] = value;
      rows.push(createElement(SliderRow, {
        key: `${key}-x`,
        spec: { ...spec, label: `${spec.label} X` },
        value: x,
        onChange: (patch) => onChange({ [spec.name]: [patch[spec.name], y] }),
      }));
      rows.push(createElement(SliderRow, {
        key: `${key}-y`,
        spec: { ...spec, label: `${spec.label} Y` },
        value: y,
        onChange: (patch) => onChange({ [spec.name]: [x, patch[spec.name]] }),
      }));
    } else {
      rows.push(createElement(SliderRow, { key, spec, value, onChange }));
    }
  }
  return createElement('div', { className: 'template-effect-controls' }, rows);
}
