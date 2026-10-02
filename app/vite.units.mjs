// Dev-only. The DEV panel asks this server to run the suites for one PR.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { suitesFor } from './qa/units.mjs';

function sh(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function walk(app, dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(app, p, out);
    else if (name.endsWith('.selfcheck.mjs')) out.push(relative(app, p).split('\\').join('/'));
  }
  return out;
}

export function unitsDevPlugin(app) {
  return {
    name: 'kc-units',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__kc/units', async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const pr = url.searchParams.get('pr');
        res.setHeader('content-type', 'application/json');
        if (!pr) {
          const listed = await sh('gh', ['pr', 'list', '--repo', 'NeuralIO444/Kinetic_Curator', '--state', 'open', '--limit', '12', '--json', 'number,title']);
          res.end(JSON.stringify({ prs: listed.code === 0 ? JSON.parse(listed.stdout || '[]') : [], error: listed.code === 0 ? '' : listed.stderr }));
          return;
        }
        const diff = await sh('gh', ['pr', 'diff', pr, '--name-only', '--repo', 'NeuralIO444/Kinetic_Curator']);
        const files = diff.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
        const all = walk(app, join(app, 'src'));
        const listing = (dir) => existsSync(join(app, dir)) ? readdirSync(join(app, dir)) : [];
        listing.all = all;
        const suites = suitesFor(files, listing);
        const results = [];
        for (const suite of suites) {
          const run = await sh(process.execPath, ['--test', suite], app);
          results.push({ suite, ok: run.code === 0, tail: (run.stderr || run.stdout).split('\n').slice(-4).join('\n') });
        }
        res.end(JSON.stringify({ pr, files, suites, results }));
      });
    },
  };
}
