// node src/gl/uniformLocations.selfcheck.mjs
// #1665 (audit fix 2) — the uniform-location locator contract: a (program, name)
// pair is resolved through the GL exactly once per locator, repeats hand back
// the identical location object, programs cache independently even when they
// share a uniform name, and an inactive uniform's null is cached like any
// other answer. Written against a pass-through locator this fails on the call
// counts — that failure is the audit's per-frame driver lookup, measured.
import assert from 'node:assert/strict';
import { createUniformLocator } from './uniformLocations.mjs';

// A counting fake GL. Each getUniformLocation call mints a FRESH object, so
// identity across repeats can only come from the locator's cache, never from
// the GL handing back a canonical object. 'u_gone' is an inactive uniform.
function makeFakeGl() {
  return {
    calls: 0,
    getUniformLocation(program, name) {
      this.calls += 1;
      if (name === 'u_gone') return null;
      return { program: program.id, name };
    },
  };
}

const progA = { id: 'A' };
const progB = { id: 'B' };

// 1. repeats are free and identical: N lookups of one (program, name) cost
//    exactly one GL call and return the same object every time
{
  const gl = makeFakeGl();
  const U = createUniformLocator(gl);
  const first = U(progA, 'u_canvas');
  for (let i = 0; i < 50; i += 1) {
    assert.equal(U(progA, 'u_canvas'), first, 'repeat lookup returns the identical location object');
  }
  assert.equal(gl.calls, 1, `51 lookups of one uniform must cost 1 GL call, cost ${gl.calls}`);
}

// 2. programs are independent: the same uniform name on two programs is two
//    locations and two GL calls — identity keying, never name keying
{
  const gl = makeFakeGl();
  const U = createUniformLocator(gl);
  const a = U(progA, 'u_canvas');
  const b = U(progB, 'u_canvas');
  assert.notEqual(a, b, 'same name on different programs must not share a location');
  assert.equal(a.program, 'A');
  assert.equal(b.program, 'B');
  assert.equal(U(progA, 'u_canvas'), a);
  assert.equal(U(progB, 'u_canvas'), b);
  assert.equal(gl.calls, 2, `two programs x one name must cost 2 GL calls, cost ${gl.calls}`);
}

// 3. a null (inactive uniform) is an answer too: cached, not re-asked
{
  const gl = makeFakeGl();
  const U = createUniformLocator(gl);
  assert.equal(U(progA, 'u_gone'), null);
  assert.equal(U(progA, 'u_gone'), null);
  assert.equal(gl.calls, 1, `an inactive uniform must be asked about once, was asked ${gl.calls} times`);
}

// 4. locators are per-renderer: a second locator over the same GL keeps its
//    own cache (renderer instances never share state)
{
  const gl = makeFakeGl();
  const U1 = createUniformLocator(gl);
  const U2 = createUniformLocator(gl);
  U1(progA, 'u_canvas');
  U2(progA, 'u_canvas');
  assert.equal(gl.calls, 2, 'each locator resolves once for itself');
  U1(progA, 'u_canvas');
  U2(progA, 'u_canvas');
  assert.equal(gl.calls, 2, 'and neither re-asks afterwards');
}

console.log('uniformLocations.selfcheck: ok (#1665)');
