# QA harness

## Review cockpit

One command builds a self-contained review page for a PR — CI status, selfcheck,
the PR's "Review this" checklist (ticks save in your browser), QA screenshots,
and a localhost link, all on one page:

```sh
npm run review -- 682            # full cockpit for PR #682
npm run review -- 682 --no-qa    # skip the browser scenarios (faster)
npm run review -- 682 --headed   # watch the QA browser while it runs
```

It puts the PR's branch in a sibling worktree (`../kc-682-review`, reused if it
exists), runs `npm install` only when needed, and writes
`qa-report/review-682.html` (gitignored) — then opens it. Checklist ticks persist
per-PR in the browser's localStorage.

Checks a change's *behaviour* in a real browser and hands you a page with a pass/fail per step
and screenshots of the exact spot. It exists because "click X, then look near the bottom of
panel Y" is slow and easy to get lost in. It is **not** the e2e gate (`npm run test:e2e`) — it
is not run by CI and never blocks a PR.

```sh
npm run qa                         # run every scenario
npm run qa -- palette-import       # run one (file name in qa/scenarios/, no .mjs)
npm run qa -- --open               # open qa-report/index.html when done
npm run qa -- --headed             # watch the browser
QA_URL=http://127.0.0.1:5180/Kinetic_Curator/ npm run qa    # reuse a running dev server
```

With no `QA_URL` it starts its own Vite dev server on :5199. **It tests whatever branch is checked
out** — a dev server serves the working tree, so check out the PR branch first (or use a git
worktree). Output goes to `qa-report/` (gitignored). Exit code is 1 if any scenario fails.

## Writing a scenario

`qa/scenarios/<name>.mjs`:

```js
export default {
  describe: 'one line for the report',
  async run(ctx) {
    const page = await ctx.newPage();          // isolated profile, first-run overlay off
    await ctx.openApp(page);
    await ctx.tab(page, /pipeline/i);
    // ...drive the UI...
    ctx.check('what should be true', actual === expected, `got: ${actual}`);
    await ctx.snap(page, 'label', page.locator('.some-element'));   // element or full page
  },
};
```

Assert on what a user can see (DOM text), not on internals. Encode the *currently intended*
behaviour, and say so in a comment when it is a known interim (see `palette-import`, #628) — that
line has to change when the bug is fixed.

Pure report rendering is unit-tested in `report.selfcheck.mjs` (in the selfcheck manifest).
