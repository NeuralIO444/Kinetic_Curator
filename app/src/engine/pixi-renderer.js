// engine/pixi-renderer.js — PIXI.js renderer for WebGL mode
// Rasterizes SVG asset fragments to textures and draws them as sprites.

import { Application, Container, Sprite, Texture, RenderTexture } from 'pixi.js';

const TEXTURE_SIZE = 200; // rasterization resolution per asset (viewBox is 100x100)
const TEXTURE_CACHE_CAP = 256; // LRU bound — each tex is ~160 KB GPU memory.
// Map iteration order is insertion order in JS, so a Map doubles as an LRU
// when we delete+set on every hit to bump recency. Cheap and stable.
const textureCache = new Map();
const inflightLoads = new Map();

function touchTexture(key) {
  // Move the entry to the most-recent position.
  const tex = textureCache.get(key);
  if (!tex) return null;
  textureCache.delete(key);
  textureCache.set(key, tex);
  return tex;
}

function admitTexture(key, tex) {
  textureCache.set(key, tex);
  while (textureCache.size > TEXTURE_CACHE_CAP) {
    const oldestKey = textureCache.keys().next().value;
    const oldestTex = textureCache.get(oldestKey);
    textureCache.delete(oldestKey);
    try { oldestTex?.destroy?.(true); } catch { /* PIXI may have already disposed */ }
  }
}

function cacheKey(assetId, ink, accent) {
  return `${assetId}::${ink}::${accent}`;
}

function rasterizeSvg(assetId, svgFragment, ink, accent) {
  const key = cacheKey(assetId, ink, accent);
  const cached = touchTexture(key);
  if (cached) return Promise.resolve(cached);
  const pending = inflightLoads.get(key);
  if (pending) return pending;

  const resolved = svgFragment
    .replace(/var\(--ink\)/g, ink)
    .replace(/var\(--accent\)/g, accent);
  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${TEXTURE_SIZE}" height="${TEXTURE_SIZE}">${resolved}</svg>`;
  const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(fullSvg)));

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = TEXTURE_SIZE;
      canvas.height = TEXTURE_SIZE;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
      const tex = Texture.from(canvas);
      admitTexture(key, tex);
      inflightLoads.delete(key);
      resolve(tex);
    };
    img.onerror = () => {
      inflightLoads.delete(key);
      resolve(Texture.EMPTY);
    };
    img.src = dataUrl;
  });
  inflightLoads.set(key, promise);
  return promise;
}

export class PixiRenderer {
  constructor() {
    this.app = null;
    this.container = null;
    this.sprites = [];   // SVG sprites
    this.particles = []; // pooled Sprite particles (shared circle texture)
    this.disposed = false;
    this.renderToken = 0;
    // Feedback loop (Item 10)
    this.feedbackTexA = null;
    this.feedbackTexB = null;
    this.feedbackSprite = null;
    this.feedbackConfig = { enabled: false, strength: 0.1, depth: 5 };
    this.feedbackTickCb = null;
    this.canvasSize = { w: 0, h: 0 };
  }

  async init(canvasEl, width, height) {
    this.app = new Application();
    await this.app.init({
      canvas: canvasEl,
      width,
      height,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      preference: 'webgl',
    });
    if (this.disposed) {
      this.app.destroy(true, { children: true });
      this.app = null;
      return;
    }
    // PIXI's autoDensity sets canvas.style.{width,height} in CSS px to the
    // values passed above (1000x700). We want the canvas to fill its
    // container instead. Re-apply the layout style after init.
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    canvasEl.style.position = 'absolute';
    canvasEl.style.inset = '0';
    this.canvasSize = { w: width, h: height };
    // Shared circle texture for particles (rasterize once, batch many).
    this.particleTexture = this._makeCircleTexture(64);
    this.feedbackTexA = RenderTexture.create({ width, height, resolution: 1 });
    this.feedbackTexB = RenderTexture.create({ width, height, resolution: 1 });
    this.feedbackSprite = new Sprite(this.feedbackTexA);
    this.feedbackSprite.anchor.set(0.5);
    this.feedbackSprite.position.set(width / 2, height / 2);
    this.feedbackSprite.visible = false;
    this.app.stage.addChild(this.feedbackSprite);

    this.layersRoot = new Container();
    this.container = new Container();
    this.app.stage.addChild(this.layersRoot);
    this.app.stage.addChild(this.container);
    this.layerContainers = new Map(); // id → { container, sprites: [], particles: [] }

    // Capture stage to feedback texture each tick when feedback is enabled
    this.feedbackTickCb = () => this._captureFeedback();
    this.app.ticker.add(this.feedbackTickCb);
  }

  setFeedback({ enabled, strength, depth }) {
    if (!this.feedbackSprite) return;
    this.feedbackConfig = { enabled, strength, depth };
    this.feedbackSprite.visible = !!enabled;
    if (!enabled) return;
    this.feedbackSprite.alpha = Math.max(0, Math.min(1, strength));
    // depth (1..20) → gentle zoom (1.005..1.10)
    const zoom = 1 + depth * 0.005;
    this.feedbackSprite.scale.set(zoom);
  }

  _captureFeedback() {
    if (!this.app || !this.feedbackConfig.enabled || !this.feedbackTexA || !this.feedbackTexB) return;
    // Hide the feedback sprite during capture so we don't bake it into itself;
    // its texture already represents the prior frame.
    const wasVisible = this.feedbackSprite.visible;
    this.feedbackSprite.visible = false;
    try {
      this.app.renderer.render({ container: this.app.stage, target: this.feedbackTexB });
    } catch { /* ignore */ }
    this.feedbackSprite.visible = wasVisible;
    // Swap: B holds latest, becomes the next "previous"
    this.feedbackSprite.texture = this.feedbackTexB;
    const tmp = this.feedbackTexA;
    this.feedbackTexA = this.feedbackTexB;
    this.feedbackTexB = tmp;
  }

  _makeCircleTexture(size = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    return Texture.from(canvas);
  }

  setViewport({ zoom, panX, panY, canvasW, canvasH }) {
    if (!this.container) return;
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const apply = (c) => {
      c.position.set(cx + panX, cy + panY);
      c.scale.set(zoom);
      c.pivot.set(cx, cy);
    };
    apply(this.container);
    if (this.layersRoot) apply(this.layersRoot);
  }

  resize(w, h) {
    if (!this.app) return;
    this.app.renderer.resize(w, h);
    this.canvasSize = { w, h };
    // Recreate feedback textures at new size
    if (this.feedbackTexA) {
      try { this.feedbackTexA.destroy(true); } catch { /* ignore */ }
      try { this.feedbackTexB.destroy(true); } catch { /* ignore */ }
      this.feedbackTexA = RenderTexture.create({ width: w, height: h, resolution: 1 });
      this.feedbackTexB = RenderTexture.create({ width: w, height: h, resolution: 1 });
      this.feedbackSprite.texture = this.feedbackTexA;
      this.feedbackSprite.position.set(w / 2, h / 2);
    }
  }

  // Internal: paint an items[] into a given container, using the provided
  // sprite/particle pools. Returns updated pools for caller bookkeeping.
  async _paint(items, container, sprites, particles, opts = {}) {
    const token = ++this.renderToken;
    const { blendMode = 'normal', blendStrength = 1 } = opts;
    const pixiBlend = blendMode === 'normal' ? 'normal' : blendMode;
    const isLayer = !!opts.isLayer; // layer items don't apply per-item blend (container handles it)

    const svgItems = [];
    const particleItems = [];
    for (const item of items) {
      if (item.particle) particleItems.push(item);
      else if (item.asset) svgItems.push(item);
    }

    while (sprites.length < svgItems.length) {
      const s = new Sprite();
      s.anchor.set(0);
      container.addChild(s);
      sprites.push(s);
    }
    for (let i = svgItems.length; i < sprites.length; i++) {
      sprites[i].visible = false;
    }

    // Particles: pooled Sprites over a shared circle texture so all particles
    // batch into a single draw call. Tint = color, scale = radius.
    while (particles.length < particleItems.length) {
      const s = new Sprite(this.particleTexture);
      s.anchor.set(0.5);
      container.addChild(s);
      particles.push(s);
    }
    for (let i = particleItems.length; i < particles.length; i++) {
      particles[i].visible = false;
    }

    for (let i = 0; i < particleItems.length; i++) {
      const item = particleItems[i];
      const sp = particles[i];
      sp.visible = true;
      // Texture is 64×64; "radius 10" → world diameter 20 → scale 20/64
      const radius = Math.max(1, item.scale * 10);
      sp.scale.set((radius * 2) / 64);
      sp.position.set(item.x, item.y);
      // Tint accepts numeric or "#rrggbb"
      sp.tint = item.color;
      sp.alpha = (item.alpha / 100) * (isLayer || blendMode === 'normal' ? 1 : blendStrength);
      if (!isLayer) sp.blendMode = pixiBlend;
    }

    for (let i = 0; i < svgItems.length; i++) {
      const item = svgItems[i];
      const sprite = sprites[i];
      sprite.visible = true;
      sprite.position.set(item.x, item.y);
      sprite.rotation = (item.rotation * Math.PI) / 180;
      const baseScale = item.scale / (TEXTURE_SIZE / 100);
      sprite.scale.set(baseScale);
      sprite.alpha = (item.alpha / 100) * (isLayer || blendMode === 'normal' ? 1 : blendStrength);
      if (!isLayer) sprite.blendMode = pixiBlend;
    }

    const loads = svgItems.map((item, i) =>
      rasterizeSvg(item.asset.id, item.asset.svg, item.color, item.accent).then((tex) => {
        if (token !== this.renderToken || this.disposed) return;
        const sprite = sprites[i];
        if (sprite && sprite.visible) sprite.texture = tex;
      })
    );
    await Promise.all(loads);
  }

  async update(items, options = {}) {
    if (!this.app || !this.container) return;
    return this._paint(items, this.container, this.sprites, this.particles, options);
  }

  async updateLayers(layerRenderItems = []) {
    if (!this.app || !this.layersRoot) return;
    const seen = new Set();
    for (const { layer, items } of layerRenderItems) {
      seen.add(layer.id);
      let entry = this.layerContainers.get(layer.id);
      if (!entry) {
        const c = new Container();
        this.layersRoot.addChild(c);
        entry = { container: c, sprites: [], particles: [] };
        this.layerContainers.set(layer.id, entry);
      }
      entry.container.alpha = layer.opacity;
      entry.container.blendMode = layer.blendMode === 'normal' ? 'normal' : layer.blendMode;
      await this._paint(items, entry.container, entry.sprites, entry.particles, { isLayer: true });
    }
    // Cull removed layers
    for (const [id, entry] of this.layerContainers) {
      if (!seen.has(id)) {
        this.layersRoot.removeChild(entry.container);
        try { entry.container.destroy({ children: true }); } catch { /* ignore */ }
        this.layerContainers.delete(id);
      }
    }
  }

  destroy() {
    this.disposed = true;
    if (this.app) {
      if (this.feedbackTickCb) {
        try { this.app.ticker.remove(this.feedbackTickCb); } catch { /* ignore */ }
        this.feedbackTickCb = null;
      }
      try {
        this.app.destroy(true, { children: true, texture: false });
      } catch {
        // ignore
      }
      this.app = null;
    }
    if (this.feedbackTexA) { try { this.feedbackTexA.destroy(true); } catch { /* ignore */ } }
    if (this.feedbackTexB) { try { this.feedbackTexB.destroy(true); } catch { /* ignore */ } }
    if (this.particleTexture) { try { this.particleTexture.destroy(true); } catch { /* ignore */ } }
    this.feedbackTexA = null;
    this.feedbackTexB = null;
    this.feedbackSprite = null;
    this.particleTexture = null;
    this.container = null;
    this.layersRoot = null;
    this.sprites = [];
    this.particles = [];
    if (this.layerContainers) this.layerContainers.clear();
  }
}
