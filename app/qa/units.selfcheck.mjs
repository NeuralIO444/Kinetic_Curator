import assert from 'node:assert/strict';
import { test } from 'node:test';
import { suitesFor } from './units.mjs';

const listing = (dir) => dir.endsWith('pipeline') ? ['pipelineNotices.selfcheck.mjs', 'DataExportRow.jsx'] : [];
listing.all = ['src/panels/pipeline/pipelineNotices.selfcheck.mjs', 'src/gl/accum.seam.selfcheck.mjs'];

test('units map a helper to the suite beside it', () => {
  const suites = suitesFor(['app/src/panels/pipeline/pipelineNotices.mjs'], listing);
  assert.ok(suites.includes('src/panels/pipeline/pipelineNotices.selfcheck.mjs'));
});

test('units keep a named suite when the diff is the suite', () => {
  const suites = suitesFor(['src/gl/accum.seam.selfcheck.mjs'], listing);
  assert.ok(suites.includes('src/gl/accum.seam.selfcheck.mjs'));
});
