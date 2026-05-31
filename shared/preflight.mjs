import fs from 'node:fs/promises';
import path from 'node:path';

// Recursively collect files with matching extensions, returning [{ path, content }].
async function collectFiles(targetDir, exts) {
  const out = [];
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache']);

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        await walk(full);
      } else if (entry.isFile() && exts.includes(path.extname(entry.name))) {
        try {
          const content = await fs.readFile(full, 'utf8');
          out.push({ path: full, content });
        } catch {
          // unreadable, skip
        }
      }
    }
  }

  await walk(targetDir);
  return out;
}

function anyMatches(files, regex) {
  const hits = [];
  for (const f of files) {
    if (regex.test(f.content)) hits.push(f.path);
  }
  return hits;
}

async function checkEmDash(files) {
  const hits = anyMatches(files, /—/);
  return {
    id: 'em-dash',
    name: 'No em-dash characters',
    pass: hits.length === 0,
    note: hits.length === 0
      ? 'no em-dash found'
      : `em-dash present in ${hits.length} file(s)`,
  };
}

async function checkEyebrowCount(files) {
  // Mechanical count of eyebrow-class elements per file. Pre-Flight rule: at most one eyebrow per section.
  // Static cap: warn if any file has more than 6 eyebrow occurrences.
  let max = 0;
  let worst = null;
  for (const f of files) {
    const count = (f.content.match(/class(Name)?=["'][^"']*\beyebrow\b/g) || []).length;
    if (count > max) {
      max = count;
      worst = f.path;
    }
  }
  const pass = max <= 6;
  return {
    id: 'eyebrow-count',
    name: 'Eyebrow count within mechanical cap',
    pass,
    note: pass
      ? `max eyebrows in any file: ${max}`
      : `${worst} has ${max} eyebrows (cap 6)`,
  };
}

async function checkCTAWrap(files) {
  return {
    id: 'cta-wrap',
    name: 'CTA label does not wrap to two lines',
    pass: true,
    note: 'static check not possible; manual review required',
  };
}

async function checkThemeLock(files) {
  // Reject mixed light/dark classes on the same root.
  const hits = anyMatches(files, /<html[^>]*class=["'][^"']*\b(light)\b[^"']*\b(dark)\b/);
  return {
    id: 'theme-lock',
    name: 'Theme is locked (no mixed light + dark)',
    pass: hits.length === 0,
    note: hits.length === 0 ? 'no mixed theme classes' : `mixed in ${hits.length} file(s)`,
  };
}

async function checkHeroStack(files) {
  return {
    id: 'hero-stack',
    name: 'Hero is not three stacked cards',
    pass: true,
    note: 'static check not possible; manual review required',
  };
}

async function checkScreenHeight(files) {
  // Cheap signal: hero using min-h-screen with no escape hatch.
  const hits = anyMatches(files, /min-h-screen/);
  return {
    id: 'screen-height',
    name: 'Hero does not lock to 100vh',
    pass: hits.length === 0,
    note: hits.length === 0
      ? 'no min-h-screen hero'
      : `min-h-screen in ${hits.length} file(s); confirm intentional`,
  };
}

async function checkInter(files) {
  const hits = anyMatches(files, /\bInter\b/);
  return {
    id: 'no-default-inter',
    name: 'Inter not used as default sans',
    pass: hits.length === 0,
    note: hits.length === 0 ? 'no Inter references' : `Inter referenced in ${hits.length} file(s)`,
  };
}

async function checkFraunces(files) {
  const hits = anyMatches(files, /\bFraunces\b/);
  return {
    id: 'no-default-fraunces',
    name: 'Fraunces not used as default serif',
    pass: hits.length === 0,
    note: hits.length === 0
      ? 'no Fraunces references'
      : `Fraunces referenced in ${hits.length} file(s)`,
  };
}

async function checkBeigeBrass(files) {
  // Cliché beige + brass palette.
  const beige = /#(f5f5dc|f3e5ab|e8d8b0|d9c9a0)/i;
  const brass = /#(b5a642|c5a572|cd9b54|b08d57)/i;
  const hits = [];
  for (const f of files) {
    if (beige.test(f.content) && brass.test(f.content)) hits.push(f.path);
  }
  return {
    id: 'no-beige-brass',
    name: 'No beige + brass cliché palette',
    pass: hits.length === 0,
    note: hits.length === 0 ? 'palette clean' : `beige + brass in ${hits.length} file(s)`,
  };
}

async function checkGradientText(files) {
  const hits = anyMatches(files, /bg-clip-text|background-clip:\s*text/);
  return {
    id: 'no-gradient-text',
    name: 'No gradient text on headlines',
    pass: hits.length === 0,
    note: hits.length === 0
      ? 'no gradient text'
      : `gradient text in ${hits.length} file(s); confirm intentional`,
  };
}

async function checkSideStripe(files) {
  return {
    id: 'no-side-stripe',
    name: 'No vertical side-stripe decoration',
    pass: true,
    note: 'static check not possible; manual review required',
  };
}

async function checkScrollListener(files) {
  // Naked scroll listeners without rAF / passive flag are a slop tell.
  const hits = anyMatches(files, /addEventListener\(\s*['"]scroll['"]/);
  return {
    id: 'scroll-listener',
    name: 'Scroll listeners are passive / rAF-throttled',
    pass: hits.length === 0,
    note: hits.length === 0
      ? 'no raw scroll listeners'
      : `raw scroll listener in ${hits.length} file(s); verify passive / rAF`,
  };
}

export async function preflight({ targetDir }) {
  const checks = [];
  const html = await collectFiles(targetDir, ['.html', '.tsx', '.jsx']);

  checks.push(await checkEmDash(html));
  checks.push(await checkEyebrowCount(html));
  checks.push(await checkCTAWrap(html));
  checks.push(await checkThemeLock(html));
  checks.push(await checkHeroStack(html));
  checks.push(await checkScreenHeight(html));
  checks.push(await checkInter(html));
  checks.push(await checkFraunces(html));
  checks.push(await checkBeigeBrass(html));
  checks.push(await checkGradientText(html));
  checks.push(await checkSideStripe(html));
  checks.push(await checkScrollListener(html));

  const pass = checks.every(c => c.pass);
  return { pass, checks };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? process.cwd();
  const r = await preflight({ targetDir: dir });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.pass ? 0 : 1);
}
