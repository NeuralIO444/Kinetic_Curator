import { useState } from 'react';
import { emit, Events } from '../../composition/eventBus.js';
import { useStore } from '../../state/store.js';
import { parseRecipe, recipeToProjectDoc } from '../../state/recipes.js';

// #307 — the way back in for kc-recipe/1 text. Lives inside OUTPUT (no new
// panel): copy buttons sit on each snapshot in SnapshotGallery; this row is
// the paste/apply affordance. APPLY restores the exact scene through the
// existing project-load path, so recipe apply is exactly as safe as project
// import. onMessage writes to OUTPUT's shared status line.
export function RecipeRow({ onMessage }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const applyRecipe = () => {
    const result = parseRecipe(text);
    if (!result.ok) {
      onMessage(`Recipe: ${result.error}`);
      return;
    }
    emit(Events.EXPORT_LOAD_PROJECT, recipeToProjectDoc(result.recipe));
    // #305 defensive: if the sibling task landed a store setter for the
    // sub-seed offsets, apply through it too. Pre-#305 this is a no-op and
    // the offsets ride along in the doc for the load path to pick up.
    const store = useStore.getState();
    if (typeof store.setSeedOffsets === 'function') {
      store.setSeedOffsets(result.recipe.seedOffsets);
    }
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
          style={{ width: '100%' }}
          title="Paste a kc-recipe/1 recipe to restore its exact scene"
        >
          {open ? '▾ PASTE RECIPE' : '▸ PASTE RECIPE'}
        </button>
      </div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'kc-recipe/1\nseed: 0x1a2b3c4d\npalette: praystation\n…'}
            rows={7}
            spellCheck={false}
            aria-label="Recipe text to apply"
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
              APPLY RECIPE
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
