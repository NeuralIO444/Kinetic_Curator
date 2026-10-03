# Open Hand

The other hand. Render-time ink, not a warp, not a library.

Crooked Hand of God leans and pinches the quad. The asset id stays. Open Hand leaves the quad alone and changes how that same cell is drawn: stroke, hollow, double line, crop. Amount 0 is today's ink. The library does not grow. The atlas does not rebake.

## Where it runs

In the fragment shader, after the cell is sampled, the one place live and stills share. It reads a seed already on the instance. It does not write fields onto the SVG. It does not advance a cell strip. That is kineme. It does not move vertices. That is Crooked Hand.

## The closed set

Not a generator. Four inks:

- Stroke. The fill becomes an edge. The interior drops.
- Hollow. A hole in the middle, seeded, so two copies are not the same ring.
- Double. A second offset strike of the same cell, faint, same asset.
- Crop. A seeded window, so part of the mark is held back.

## Control

A slider, default 0. The seed picks which ink and how far, inside a clamp, so a mark does not vanish. The same seed gives the same ink every run. Freeze holds it. The governor sheds it by writing amount 0. It can sit next to Crooked Hand. They do not share a slider.

## Do not

- Do not mint variant assets.
- Do not write fields onto the SVG.
- Do not change the asset id.
- Do not randomize per frame.
- Do not use this to lean the mark. That is the other hand.

## First cut

Stroke and hollow only, gated off. A selfcheck proves amount 0 matches the current sample. Double and crop wait until that cut is green.

## Review

Amount 0: the picture matches main. Amount up: the same asset strokes and hollows, and a reseed repeats the same ink.
