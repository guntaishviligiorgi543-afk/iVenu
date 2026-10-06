// Isolated DOM tests, no real auth, network, provider or production data.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { JSDOM } = require('../.tmp/support-tests/node_modules/jsdom');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const html = fs.readFileSync('profile.html', 'utf8');
const fixture = fs.readFileSync('tests/support-fixture.js', 'utf8');
const account = fs.readFileSync('account.js', 'utf8');
const wait = async predicate => { for (let i = 0; i < 150; i++) { if (predicate()) return; await new Promise(done => setTimeout(done, 10)); } throw new Error('DOM condition timed out'); };
async function scenario({ width, role, request = 10, hidden = false, failRoles = false, signedOut = false }) {
  const dom = new JSDOM(html, { url: `https://ivenue.site/profile.html?role=${role}&section=support&request=${id(request)}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom; const doc = window.document;
  window.console.error = () => {}; // Expected fixture lookup failures are asserted below.
  window.matchMedia = query => ({ matches: query.includes('max-width') ? width <= Number(query.match(/\d+/)[0]) : width >= Number(query.match(/\d+/)[0]), addEventListener() {}, removeEventListener() {} });
  window.innerWidth = width;
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  try {
    window.eval(fixture); window.fixture.failRoles = failRoles;
    if (signedOut) window.authApi.getSession = async () => null;
    if (hidden) window.fixture.requests.find(item => item.id === id(request)).customer_deleted_at = '2026-10-06T00:00:00Z';
    window.eval(account);
    if (signedOut) {
      await wait(() => doc.querySelector('#accountStatus').textContent.includes('Please sign in'));
      assert.equal(doc.querySelector('.account-sidebar-item[data-section="support"]').hidden, true);
      assert(!window.fixture.calls.some(call => call.table?.startsWith('support_')));
      return;
    }
    await wait(() => window.fixture.calls.some(call => call.rpc === 'is_current_user_support_employee'));
    if (role !== 'customer' || failRoles) {
      await new Promise(done => setTimeout(done, 80));
      assert.equal(doc.querySelector('.account-sidebar-item[data-section="support"]').hidden, true);
      assert(!window.fixture.calls.some(call => call.table?.startsWith('support_') || call.rpc === 'get_support_unread_state'));
      doc.querySelector('.account-sidebar-item[data-section="support"]').click();
      assert(!doc.querySelector('.account-section[data-section="support"]').classList.contains('is-visible'));
    } else if (hidden || request === 11) {
      await wait(() => doc.querySelector('#supportCustomerMessageList').textContent.includes('could not be loaded'));
      assert(!window.fixture.calls.some(call => call.table === 'support_messages' || call.rpc === 'mark_support_request_read'));
      assert.equal(doc.querySelector('#supportCustomerReplyForm').hidden, true);
    } else {
      await wait(() => doc.querySelector('#supportCustomerMessageList').textContent.includes('Thanks for your help'));
      assert(doc.querySelector('.account-section[data-section="support"]').classList.contains('is-visible'));
      const resolved = request === 12;
      assert.equal(doc.querySelector('#supportCustomerReplyForm').hidden, resolved);
      assert.equal(doc.querySelector('#supportResolvedMessage').hidden, !resolved);
      assert.equal(doc.querySelector('[data-support-filter="resolved"]').classList.contains('is-active'), resolved);
      assert(window.fixture.calls.filter(call => call.table === 'support_requests').every(call => call.filters.some(filter => filter[1] === 'customer_user_id' && filter[2] === window.fixture.userId)));
      if (width <= 760) assert.equal(doc.querySelector('#supportRequestsList').hidden, true);
      doc.querySelector('#supportCustomerReply').value = 'Customer response';
      doc.querySelector('#supportCustomerReplyForm').dispatchEvent(new window.Event('submit', { cancelable: true }));
      await new Promise(done => setTimeout(done, 20));
      assert.equal(window.fixture.calls.filter(call => call.rpc === 'add_customer_support_message').length, resolved ? 0 : 1);
      assert(!window.fixture.calls.some(call => /email|notification/.test(call.rpc || '')));
    }
    assert.deepEqual(Array.from(window.fixture.errors), []);
  } finally { dom.window.close(); }
}
(async () => {
  let cases = 0;
  for (const width of [1440, 375]) {
    for (const params of [{role:'customer'}, {role:'customer',request:12}, {role:'customer',request:11}, {role:'customer',request:14,hidden:true}, {role:'admin'}, {role:'support'}, {role:'both'}, {role:'customer',failRoles:true}, {role:'customer',signedOut:true}]) {
      await scenario({ width, ...params }); cases++;
    }
  }
  console.log(`PASS: ${cases} desktop/mobile mocked exact-request cases; own/foreign/hidden, resolved filter/read-only, active replies, role separation and failed role checks.`);
  console.log('Mocked DOM assertions do not verify painted layout or real production sessions.');
})().catch(error => { console.error(error); process.exitCode = 1; });
