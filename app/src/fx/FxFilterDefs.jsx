// FxFilterDefs — renders one <filter> per active FX layer into <defs>.
// Pure function of (layers, ctx): the same primitive list the studio path
// compiles, so live and export agree. Unknown effect kinds fail closed
// inside compileFxPrimitives — a bad effect never blanks the canvas.
import { createElement, Fragment } from 'react';
import { compileFxPrimitives, fxFilterId } from './fxFilters.js';

function primToElement(p, key) {
  const { prim, attrs, children } = p;
  const props = { key };
  for (const [k, v] of Object.entries(attrs)) {
    // React prop names for SVG filter attributes
    if (k === 'color-interpolation-filters') props.colorInterpolationFilters = v;
    else props[k] = v;
  }
  const kids = (children || []).map((c, i) => primToElement(c, `${key}-${i}`));
  return createElement(prim, props, kids.length ? kids : undefined);
}

export function FxFilterDefs({ layers, ctx }) {
  return createElement(
    Fragment,
    null,
    layers.map((layer) => {
      const prims = compileFxPrimitives(layer.effects, ctx);
      if (!prims.length) return null;
      return createElement(
        'filter',
        {
          key: fxFilterId(layer.id),
          id: fxFilterId(layer.id),
          x: '0%',
          y: '0%',
          width: '100%',
          height: '100%',
          colorInterpolationFilters: 'sRGB',
        },
        prims.map((p, i) => primToElement(p, i)),
      );
    }),
  );
}
