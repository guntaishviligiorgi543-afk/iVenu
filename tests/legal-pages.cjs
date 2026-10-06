// npm install --prefix .tmp/legal-dom --no-save --package-lock=false --ignore-scripts jsdom@26.1.0
// node tests/legal-pages.cjs
// DOM regression tests with mocked authentication; no production calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../.tmp/legal-dom/node_modules/jsdom');
const root = path.resolve(__dirname, '..');
const legalPages = ['privacy-policy.html', 'terms-of-use.html', 'data-deletion.html'];
const headerCode = fs.readFileSync(path.join(root, 'public-header.js'), 'utf8');
const authCode = fs.readFileSync(path.join(root, 'auth.js'), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function checkHeader(page, width, identity) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const dom = new JSDOM(html, { url: `https://ivenue.site/${page}`, runScripts: 'outside-only' });
  const { window } = dom;
  let session = identity ? { user: { id: 'test-user' } } : null;
  let subscriber;
  let logoutCalls = 0;
  window.innerWidth = width;
  window.matchMedia = () => ({ matches: width <= 1290 });
  window.authApi = {
    getSession: async () => session,
    isAdmin: async () => identity === 'admin',
    subscribeToAuthChanges: (callback) => { subscriber = callback; },
    requestSignOut: async () => { logoutCalls++; session = null; return true; },
  };
  window.supabaseClient = { rpc: async () => ({ data: identity === 'support', error: null }) };
  window.eval(headerCode);
  await tick();
  const doc = window.document;
  const isLegal = legalPages.includes(page);
  assert.equal(doc.querySelectorAll('header > nav .authNavLink').length, isLegal ? 0 : 2);
  assert(doc.querySelector('header .legal-header-logo') || !isLegal);
  assert.equal(doc.querySelectorAll('.mobileMenuToggle').length, 1);
  assert.equal(doc.querySelectorAll('#mobileMenu').length, 1);
  const account = doc.querySelector('.mobileMenuAccount');
  if (session) {
    assert.equal(account.querySelectorAll('.mobileLogoutButton').length, 1);
    assert.equal(account.querySelectorAll('.mobileAccountLink[href="profile.html"]').length, 1);
    assert.equal(account.querySelectorAll('a[href="login.html"]').length, 0);
  } else {
    assert.equal(account.querySelectorAll('a[href="login.html"]').length, 1);
    assert.equal(account.querySelectorAll('.mobileLogoutButton, .mobileAccountLink').length, 0);
  }
  doc.querySelector('.mobileMenuToggle').click();
  assert.equal(doc.querySelector('#mobileMenu').getAttribute('aria-hidden'), 'false');
  assert.equal(doc.querySelector('.mobileMenuToggle').getAttribute('aria-expanded'), 'true');
  if (session) {
    account.querySelector('.mobileLogoutButton').click();
    await tick();
    assert.equal(logoutCalls, 1);
    assert.equal(doc.querySelector('#mobileMenu').getAttribute('aria-hidden'), 'true');
    assert.equal(account.querySelectorAll('a[href="login.html"]').length, 1);
  } else {
    doc.querySelector('.mobileMenuClose').click();
    assert.equal(doc.querySelector('#mobileMenu').getAttribute('aria-hidden'), 'true');
  }
  subscriber('SIGNED_IN', { user: { id: 'test-user' } });
  await tick();
  assert.equal(account.querySelectorAll('.mobileLogoutButton, .mobileAccountLink').length, 2);
  if (isLegal) assert.equal(doc.querySelectorAll('header > nav .authNavLink').length, 0);
  window.eval(headerCode);
  assert.equal(doc.querySelectorAll('.mobileMenuToggle').length, 1, 'Header initialized twice');
  dom.window.close();
}

function checkDocuments() {
  for (const page of legalPages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const dom = new JSDOM(html, { url: `https://ivenue.site/${page}` });
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll('main article.legal-card').length, 1);
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.equal(doc.querySelector('.legal-meta').textContent, 'Last updated: October 5, 2026');
    assert(!/September (27|29), 2026/.test(html));
    assert(doc.querySelector('link[rel="icon"]'));
    const ids = [...doc.querySelectorAll('[id]')].map((element) => element.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const element of doc.querySelectorAll('[href], script[src], img[src]')) {
      const link = element.getAttribute('href') || element.getAttribute('src');
      if (/^(https?:|mailto:|#)/.test(link)) continue;
      const target = path.join(root, link.replace(/^\//, '').split(/[?#]/)[0]);
      assert(fs.existsSync(target), `${page}: missing local link ${link}`);
    }
    for (const target of legalPages) assert(doc.querySelector(`a[href="${target}"]`));
    const text = doc.querySelector('article').textContent;
    assert.match(text, /current iVenue password|password.*current/i);
    assert.match(text, /90 days/);
    assert.match(text, /newsletter/i);
    assert.match(text, /refresh tokens?|refresh token/i);
    assert.match(text, /not.*(automatically|permanently|erase)|remain/i);
    dom.window.close();
  }
}

async function checkPolicyVersions() {
  const dom = new JSDOM('<body class="legal-page"></body>', { url: 'https://ivenue.site/privacy-policy.html', runScripts: 'outside-only' });
  const { window } = dom;
  let records = [];
  let rpcCalls = 0;
  let query;
  query = { select: () => query, eq: () => query, in: async () => ({ data: records, error: null }) };
  window.supabaseClient = {
    auth: { getSession: async () => ({ data: { session: null }, error: null }), onAuthStateChange: () => ({}) },
    from: (table) => { assert.equal(table, 'user_policy_acceptances'); return query; },
    rpc: async (name) => { assert.equal(name, 'accept_current_policy_versions'); rpcCalls++; return { data: records, error: null }; },
  };
  window.eval(authCode);
  await tick();
  assert.deepEqual(Object.keys(window.authApi.currentPolicyVersions).sort(), ['privacy_policy', 'terms_of_use']);
  records = ['privacy_policy', 'terms_of_use'].map((policy_type) => ({ policy_type, policy_version: '2026-09-29' }));
  assert.equal(await window.authApi.hasAcceptedCurrentPolicies('test-user'), false);
  records.push({ policy_type: 'terms_of_use', policy_version: '2026-10-05' });
  assert.equal(await window.authApi.hasAcceptedCurrentPolicies('test-user'), false);
  records.push({ policy_type: 'privacy_policy', policy_version: '2026-10-05' });
  assert.equal(await window.authApi.hasAcceptedCurrentPolicies('test-user'), true);
  assert.equal(await window.authApi.acceptCurrentPolicies(), true);
  assert.equal(rpcCalls, 1);
  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'));
  const versionMigration = migrations.find((name) => name.endsWith('_update_required_policy_versions_20261005.sql'));
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations', versionMigration), 'utf8');
  assert.equal((sql.match(/2026-10-05/g) || []).length, 4);
  assert(!sql.includes('2026-09-29'));
  assert.match(sql, /on conflict on constraint user_policy_acceptances_user_policy_version_key do nothing/);
  assert(!/newsletter|delete from|truncate/i.test(sql));
  dom.window.close();
}

(async () => {
  checkDocuments();
  let cases = 0;
  for (const page of [...legalPages, 'index.html']) {
    for (const width of [1440, 768, 375]) {
      for (const identity of [null, 'customer', 'admin', 'support']) {
        await checkHeader(page, width, identity);
        cases++;
      }
    }
  }
  await checkPolicyVersions();
  console.log(`PASS: ${cases} mocked header/menu cases; document dates, local links, consistency and required-policy version checks.`);
  console.log('DOM assertions do not verify painted layout or a real authenticated production session.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
