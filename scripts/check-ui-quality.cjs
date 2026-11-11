// Run with: node scripts/check-ui-quality.cjs
// Checks the regressions reported by the editor without needing SonarQube.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const pages = ['admin', 'administrator', 'collector', 'dashboard', 'index', 'login', 'register', 'profile', 'auth'];
function cssBlockEnd(css, open, file) {
    let depth = 1, quote = '';
    for (let end = open + 1; end < css.length; end++) {
        const char = css[end];
        if (quote) {
            if (char === quote && css[end - 1] !== '\\') quote = '';
            continue;
        }
        if (char === '"' || char === "'") quote = char;
        else if (char === '{') depth++;
        else if (char === '}' && --depth === 0) return end + 1;
    }
    assert.fail(file + ': unbalanced CSS block');
}
function checkCssBlocks(css, file) {
    const selectors = new Set();
    let cursor = 0;
    while (cursor < css.length) {
        const open = css.indexOf('{', cursor);
        if (open < 0) break;
        const header = css.slice(cursor, open).trim();
        const end = cssBlockEnd(css, open, file);
        if (header.startsWith('@media') || header.startsWith('@supports') || header.startsWith('@layer')) {
            checkCssBlocks(css.slice(open + 1, end - 1), file);
        } else if (!header.startsWith('@')) {
            const key = header.replace(/\s+/g, ' ');
            assert(!selectors.has(key), `${file}: duplicate selector ${key}`);
            selectors.add(key);
        }
        cursor = end;
    }
}
for (const page of pages) {
    const html = fs.readFileSync(`app/Views/${page}.html`, 'utf8');
    assert(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:[.,"])/i.test(html), `${page}: zoom disabled`);
    assert(!/<(?:div|span)\b[^>]*\bonclick\s*=/i.test(html), `${page}: non-native click target`);
    assert(!/\brole="(?:status|region)"/.test(html), `${page}: prefer native output/section`);
    for (const tag of html.match(/<(?:script|link)\b[^>]*>/g) || []) {
        const url = tag.match(/(?:src|href)="(https:[^"]+)"/)?.[1];
        if (!url || !/cdnjs\.cloudflare\.com|unpkg\.com|cdn\.jsdelivr\.net/.test(url)) continue;
        assert(/integrity="sha(?:256|384|512)-[^"]+"/.test(tag), `${page}: missing SRI ${url}`);
        assert(/crossorigin="anonymous"/.test(tag), `${page}: missing crossorigin ${url}`);
        assert(!/npm\/(?:sweetalert2@11["/]|chart\.js["/])/.test(url), `${page}: unpinned CDN ${url}`);
    }
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
    for (const label of html.matchAll(/<label\b([^>]*)>/g)) {
        const target = label[1].match(/\bfor="([^"]+)"/)?.[1];
        assert(target && ids.has(target), `${page}: label missing a valid for/id`);
    }
    for (const input of html.match(/<(?:input|select|textarea)\b[^>]*>/g) || []) {
        if (/type="(?:hidden|submit|button)"/.test(input)) continue;
        const id = input.match(/\bid="([^"]+)"/)?.[1];
        const labelled = /aria-label(?:ledby)?=/.test(input) || id && html.includes(`for="${id}"`);
        assert(labelled, `${page}: input missing label: ${id || input}`);
    }
}
for (const file of ['auth-flat', 'landing', 'user-flat', 'collector', 'admin', 'portal-system', 'admin-inline', 'user-inline', 'facility-reports', 'facility-handling']) {
    const css = fs.readFileSync(`assets/css/${file}.css`, 'utf8');
    checkCssBlocks(css.replace(/\/\*[\s\S]*?\*\//g, ''), file);
    assert(!/!important/.test(css), `${file}: important override`);
    assert(!/transition\s*:\s*(?:all\b|\.?\d+(?:ms|s)\s*[;}])/.test(css), `${file}: unspecified transition properties`);
}
const profile = fs.readFileSync('app/Views/profile.html', 'utf8');
assert(profile.includes('prefers-reduced-motion'), 'profile: missing reduced-motion support');
assert(!/transition\s*:\s*(?:all\b|\.?\d+(?:ms|s)\s*[;}])/.test(profile), 'profile: unspecified transition properties');
assert(!profile.includes("getAttribute('data-target')"), 'profile: prefer dataset');
console.log(`PASS: ${pages.length} HTML views checked for CDN integrity/pinning, keyboard controls, native semantics, labels, and zoom; target CSS has no duplicate selectors, !important, or unspecified transitions.`);
