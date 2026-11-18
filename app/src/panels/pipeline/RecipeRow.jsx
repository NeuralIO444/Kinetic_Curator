import { useState } from 'react';
import { useStore } from '../../state/store.js';
import { parseRecipe, recipeToProjectDoc, recipeFieldsFromKept, copyTextToClipboard } from '../../state/recipes.js';
import { encodeRecipeUrl, decodeRecipeUrl, buildShareHref, extractRecipePayload } from '../../state/recipeUrls.js';

// #307 — the way back in for kc-recipe/1 text. Lives inside OUTPUT (no new
// panel): copy buttons sit on each snapshot in SnapshotGallery; this row is
// the paste/apply affordance. APPLY replaces the scene the recipe carries as ONE
// undoable edit (#2322 applyScene) and leaves the rig alone; it is no longer a project
// load. onMessage writes to OUTPUT's shared status line.
//
// #534 — COPY LINK shares the current scene as a kc-r/1 URL
// (…/#r=kc-r/1.…): seed, nonzero offsets, palette id + dirty overrides,
// non-default layout params. The paste box accepts kc-recipe/1 text OR a
// recipe link; links route through decodeRecipeUrl and the same apply path.
export function RecipeRow({ onMessage }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const store = useStore.getState();
    const fields = { ...recipeFieldsFromKept(store), paletteOverrides: store.paletteOverrides ?? null };
    const payload = encodeRecipeUrl(fields);
    const href = buildShareHref(payload, typeof window !== 'undefined' ? window.location.href : '');
    const ok = await copyTextToClipboard(href);
    if (ok) {
      setCopied(true);
      onMessage('Link copied — paste it anywhere to share this exact scene');
      setTimeout(() => {
        setCopied(false);
        onMessage(null);
      }, 2000);
    } else {
      onMessage('Link: copy failed — your browser blocked the clipboard');
    }
  };

  const applyUrlRecipe = (recipe) => {
    // #2322 — a recipe is an edit of the stage: the scene keys it carries are replaced, the rig (title, audio
    // routes, MIDI, macros, fps) is left alone, and ONE undo step brings the old scene back. The seed offsets and
    // the palette overrides ride in the doc; the follow-up store calls this used to make would each have been a
    // second undo step. #534: the link carries the full override state (null = clean).
    useStore
      .getState()
      .applyScene({ ...recipeToProjectDoc(recipe), paletteOverrides: recipe.paletteOverrides ?? null });
    setText('');
    setOpen(false);
    onMessage('Link applied');
    setTimeout(() => onMessage(null), 2000);
  };

  const applyRecipe = () => {
    // A recipe link pastes as a full URL or a bare kc-r/1.… payload.
    const payload = extractRecipePayload(text);
    if (payload) {
      const result = decodeRecipeUrl(payload);
      if (!result.ok) {
        onMessage(`Link: ${result.error}`);
        return;
      }
      applyUrlRecipe(result.recipe);
      return;
    }
    const result = parseRecipe(text);
    if (!result.ok) {
      onMessage(`Recipe: ${result.error}`);
      return;
    }
    // #2322 — as above. kc-recipe text carries no palette overrides, so the palette it names comes back stock
    // (null), exactly as a load did before.
    useStore
      .getState()
      .applyScene({ ...recipeToProjectDoc(result.recipe), paletteOverrides: result.recipe.paletteOverrides ?? null });
    setText('');
    setOpen(false);
    onMessage('Recipe applied');
    setTimeout(() => onMessage(null), 2000);
  };

  const close = () => {
    setText('');
    setOpen(false);
  };

  return (
    <>
      <div className="pipeline-row">
        <button
          className="big-btn"
          onClick={() => (open ? close() : setOpen(true))}
          style={{ flex: 1 }}
          title="Paste a kc-recipe/1 recipe or a kc-r/1 link to restore its exact scene"
        >
          {open ? '▾ PASTE RECIPE' : '▸ PASTE RECIPE'}
        </button>
        <button
          className="big-btn"
          onClick={copyLink}
          title="Copy a shareable link to this exact scene (seed + params + palette in the URL)"
        >
          {copied ? '✓ COPIED' : '⧉ COPY LINK'}
        </button>
      </div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'kc-recipe/1\nseed: 0x1a2b3c4d\npalette: praystation\n…\n\nor paste a kc-r/1 link'}
            rows={7}
            spellCheck={false}
            aria-label="Recipe text or link to apply"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 10,
              lineHeight: 1.5,
              padding: 6,
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid var(--line)',
              color: 'var(--ink)',
              resize: 'vertical',
            }}
          />
          <div className="pipeline-row">
            <button className="big-btn" onClick={applyRecipe} style={{ flex: 1 }} disabled={!text.trim()}>
              APPLY
            </button>
            <button className="big-btn" onClick={close} style={{ flex: 1 }}>
              CANCEL
            </button>
          </div>
        </div>
      )}
    </>
  );
}
