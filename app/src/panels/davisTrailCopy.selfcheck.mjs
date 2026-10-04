// davisTrailCopy.selfcheck.mjs — #560 clear-confirm: the CLEAR confirm states
// the stakes, and both dialog paths (confirm wipes, cancel preserves) hold.
import assert from 'node:assert';
import { confirmClearTrailMessage, decideClearTrail } from './davisTrailCopy.mjs';

const msg = confirmClearTrailMessage();
assert.match(msg, /wipe the trail buffer/i, 'message names the trail buffer');
assert.match(msg, /cannot be undone/i, 'message states irreversibility');

assert.strictEqual(decideClearTrail(true), 'clear', 'confirm -> clear (wipe)');
assert.strictEqual(decideClearTrail(false), null, 'cancel -> null (preserve)');
assert.strictEqual(decideClearTrail(undefined), null, 'dialog dismissed -> null (preserve)');

console.log('davisTrailCopy.selfcheck OK');
