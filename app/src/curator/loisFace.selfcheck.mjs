import assert from 'node:assert';
import { LOIS_FACES, resolveLoisFace, createLoisFaceSession } from './loisFace.js';

assert.strictEqual(resolveLoisFace({}).code, 'AWAY');
assert.strictEqual(resolveLoisFace({ inCrit: false, kept: true, dwellMs: 99999, seedRevisit: true }).code, 'AWAY');
assert.strictEqual(resolveLoisFace({ inCrit: true }).code, 'LEAN');
assert.strictEqual(resolveLoisFace({ inCrit: true, dwellMs: 8000 }).code, 'VIBE');
assert.strictEqual(resolveLoisFace({ inCrit: true, dwellMs: 7999 }).code, 'LEAN');
assert.strictEqual(resolveLoisFace({ inCrit: true, seedRevisit: true }).code, 'VIBE');
assert.strictEqual(resolveLoisFace({ inCrit: true, kept: true, dwellMs: 99999 }).code, 'NOD');
assert.strictEqual(LOIS_FACES.NOD.face, '(¬‿¬)');
assert.ok(!LOIS_FACES.CRIT);

{
  const s = createLoisFaceSession();
  assert.strictEqual(s.face().code, 'AWAY');
  s.noteCurate();
  assert.strictEqual(s.face({ dwellMs: 0 }).code, 'LEAN');
  assert.strictEqual(s.face({ dwellMs: 8000 }).code, 'VIBE');
  s.noteKeep();
  assert.strictEqual(s.face({ dwellMs: 20000 }).code, 'NOD');
  s.noteCurate();
  assert.strictEqual(s.face({ seedRevisit: true }).code, 'VIBE');
  s.noteBrowse();
  assert.strictEqual(s.face({ dwellMs: 0, seedRevisit: false }).code, 'LEAN');
}

console.log('loisFace.selfcheck: ok');
