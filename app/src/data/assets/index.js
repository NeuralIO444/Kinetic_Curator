// Asset index — combines all parts into a single export
import { ASSETS_PART1 } from './assets-organic-geo.js';
import { ASSETS_PART2 } from './assets-line-floral.js';
import { ASSETS_PART3 } from './assets-stamp-radial.js';
import { ASSETS_PART4 } from './assets-experimental.js';
import { ASSETS_PART5 } from './assets-haeckel.js';
import { ASSETS_MICRO } from './assets-micro-hud.js';
import { ASSETS_LETTERS } from './assets-letterforms.js';
import { ASSETS_SUB_DEMO } from './assets-sub-demo.js';

export const ASSETS = [...ASSETS_PART1, ...ASSETS_PART2, ...ASSETS_PART3, ...ASSETS_PART4, ...ASSETS_PART5, ...ASSETS_MICRO, ...ASSETS_LETTERS, ...ASSETS_SUB_DEMO];
