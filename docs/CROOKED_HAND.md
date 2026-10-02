# Crooked Hand of God

Render-time variety. Not a library. Not a new asset.

The catalog is a small set of static SVGs. Each one is baked once. The atlas key is the asset id. Changing that id to fake a variant rebakes the atlas and breaks the hold rule. The variety that already exists is motion only: phase, drift, and speed sit in a tight band. Two copies of the same mark drift apart. The silhouette does not change.

Crooked Hand of God is a curator that runs at draw time. It warps the quad. The asset id stays the same. The library does not grow. Amount 0 is today's picture.

## Where it runs

In the vertex shader, the one place every live path and the stills path share. It reads a seed already on the instance. It does not write fields onto the SVG. It does not advance a cell strip. That is kineme, and kineme is motion inside a mark.

## The closed set

Not a generator. Five hands:

- Shear. The mark leans.
- Pinch. One end gets thinner.
- Stretch. Wider or taller, not a uniform scale.
- Nick. One side only, so a pair is not a mirror.
- Flip. A seeded horizontal turn, still the same cell.

## Control

A slider, default 0. The seed picks which hand and how far, inside a clamp, so a circle does not become a scribble. The same seed gives the same crookedness every run. Freeze holds it. The governor sheds it by writing amount 0.

## Do not

- Do not mint variant assets.
- Do not write fields onto the SVG.
- Do not change the asset id.
- Do not randomize per frame.
- Do not use a cell strip for this.

## First cut

Shear and pinch only, gated off. A selfcheck proves amount 0 matches the current quad. Stretch, nick, and flip wait until that cut is green.

## Review

Amount 0: the picture matches main. Amount up: the same asset leans and pinches, and a reseed repeats the same crookedness.
