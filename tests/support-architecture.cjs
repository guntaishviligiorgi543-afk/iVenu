// Run: node tests/support-architecture.cjs
// Uses an isolated headless Chromium profile and a local mock backend only.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "ivenue-support-check-"));
const chromium = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let content = fs.readFileSync(file);
  const ext = path.extname(file);
  if (ext === ".html") {
    const script = path.basename(file) === "profile.html" ? "account.js" : "admin-dashboard.js";
    content = content.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace("</body>", `<script src="tests/support-fixture.js"></script><script src="${script}"></script></body>`);
  }
  if (ext === ".css") content = content.toString().replace(/@import[^;]+;/g, "");
  res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "application/javascript", ".css": "text/css" })[ext] || "application/octet-stream");
  res.end(content);
});
let chrome, ws;
(async () => {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  console.log("Local fixture server ready");
  const origin = `http://127.0.0.1:${server.address().port}`;
  chrome = spawn(chromium, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${path.join(output, "profile")}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  const endpoint = await new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => reject(new Error("Chromium startup timed out")), 15000);
    chrome.on("error", reject);
    chrome.stderr.on("data", (data) => { buffer += data; const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
  });
  const debugOrigin = endpoint.replace(/^ws:/, "http:").split("/devtools/")[0];
  console.log("Headless Chromium ready");
  const targets = await (await fetch(`${debugOrigin}/json/list`, { signal: AbortSignal.timeout(10000) })).json();
  ws = new WebSocket(targets.find((item) => item.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  ws.onmessage = (event) => { const message = JSON.parse(event.data); const task = pending.get(message.id); if (task) { pending.delete(message.id); message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result); } };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 10000);
    pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => { const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const waitFor = async (expression) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise((done) => setTimeout(done, 30)); } throw new Error(`Timed out: ${expression}`); };
  const navigate = async (page) => { await cdp("Page.navigate", { url: `${origin}/${page}` }); await waitFor("document.readyState === 'complete' && !!window.fixture"); };
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const visible = (selector) => evaluate(`!!document.querySelector(${JSON.stringify(selector)})?.getClientRects().length`);
  await cdp("Page.enable");
  await cdp("Network.enable");
  await cdp("Network.setBlockedURLs", { urls: ["https://*", "http://fonts.*"] });
  const nav = '.account-sidebar-item[data-section="support"]';
  const section = '.account-section[data-section="support"]';
  for (const role of ["support", "admin", "both"]) {
    await navigate(`profile.html?role=${role}&slow=1&section=support&request=00000000-0000-4000-8000-000000000010`);
    assert.equal(await visible(nav), false, `${role}: no initial flash`);
    await new Promise((done) => setTimeout(done, 230));
    await click(nav);
    assert.equal(await visible(section), false, `${role}: forced click blocked`);
    assert.equal(await evaluate("fixture.calls.some(c => c.table?.startsWith('support_') || c.rpc === 'get_support_unread_state')"), false, `${role}: no customer data reads`);
  }
  console.log("PASS privileged roles, delayed role checks, deep links, and forced navigation");
  await evaluate("fixture.role='customer'; window.dispatchEvent(new Event('focus'))");
  await waitFor("document.querySelectorAll('[data-support-request-id]').length > 0");
  assert.equal(await visible(nav), true, "revoked membership restores customer navigation");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-support-request-id]')].length"), 6);
  await waitFor("document.querySelector('#supportCustomerReplyForm').hidden === false");
  assert.equal(await evaluate("fixture.calls.filter(c=>c.table==='support_requests').every(c=>c.filters.some(f=>f[1]==='customer_user_id' && f[2]===fixture.userId))"), true);
  assert.equal(await evaluate("document.querySelector('#supportCustomerMessageList').textContent.includes('Thanks for your help')"), true);
  await evaluate("document.querySelector('#supportCustomerReply').value='Test reply'; document.querySelector('#supportCustomerReplyForm').requestSubmit()");
  await waitFor("fixture.calls.some(c=>c.rpc==='add_customer_support_message')");
  await waitFor("!document.querySelector('#supportCustomerReplySubmit').disabled");
  await click('[data-support-filter="resolved"]');
  await waitFor("document.querySelectorAll('[data-support-request-id]').length === 1");
  await click('[data-support-request-id]');
  await waitFor("document.querySelector('#supportResolvedMessage').hidden === false");
  const replies = await evaluate("fixture.calls.filter(c=>c.rpc==='add_customer_support_message').length");
  await evaluate("document.querySelector('#supportCustomerReplyForm').dispatchEvent(new Event('submit', {cancelable:true}))");
  assert.equal(await evaluate("fixture.calls.filter(c=>c.rpc==='add_customer_support_message').length"), replies);
  await evaluate("fixture.role='support'; window.dispatchEvent(new Event('focus'))");
  await waitFor("document.querySelector('.account-sidebar-item[data-section=\"support\"]').hidden");
  assert.equal(await visible(section), false);
  console.log("PASS revoked history, explicit ownership, conversations, replies, resolved UI guard, role grant while open");
  await navigate("profile.html?section=support&request=00000000-0000-4000-8000-000000000011");
  await waitFor("document.querySelector('#supportCustomerMessageList').textContent.includes('could not be loaded')");
  assert.equal(await evaluate("fixture.calls.some(c=>c.table==='support_messages' || c.rpc==='mark_support_request_read')"), false);
  await evaluate("fixture.failRoles=true; window.dispatchEvent(new Event('focus'))");
  await waitFor("document.querySelector('.account-sidebar-item[data-section=\"support\"]').hidden");
  console.log("PASS foreign request deep link rejected before messages/read RPC and role lookup fails closed");
  await navigate("admin-dashboard.html?role=admin");
  await waitFor("!document.body.classList.contains('admin-gated')");
  await click('.admin-nav button[data-panel="support"]');
  await waitFor("document.querySelectorAll('#supportRequestRows tr').length === 10");
  assert.equal(await evaluate("document.querySelectorAll('#supportRequestMetrics article').length"), 4);
  assert.equal(await evaluate("document.querySelector('#supportRequestRows').textContent.includes('Customer B')"), true);
  await click('[data-support-request-page="2"]');
  await waitFor("document.querySelector('#supportRequestPagination').textContent.includes('Page 2')");
  await evaluate("document.querySelector('#supportRequestSearch').value='no matches'; document.querySelector('#supportRequestSearch').dispatchEvent(new Event('input'))");
  await waitFor("document.querySelector('#supportRequestListStatus').textContent.includes('No Support requests')");
  await evaluate("document.querySelector('#supportRequestSearch').value=''; document.querySelector('#supportRequestSearch').dispatchEvent(new Event('input'))");
  await waitFor("document.querySelectorAll('#supportRequestRows tr').length === 10");
  for (const width of [1440, 1024, 768, 375]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${width}px list overflow`);
    await cdp("Page.captureScreenshot", { format: "png" }).then((result) => fs.writeFileSync(path.join(output, `admin-${width}.png`), Buffer.from(result.data, "base64")));
    await click(width > 1100 ? '#supportRequestRows [data-support-view-request]' : '#supportRequestCards [data-support-view-request]');
    await waitFor("document.querySelectorAll('.support-audit-message').length === 50");
    assert.equal(await evaluate("document.querySelector('#supportRequestDetailsDialog').scrollWidth <= document.querySelector('#supportRequestDetailsDialog').clientWidth"), true, `${width}px detail overflow`);
    await cdp("Page.captureScreenshot", { format: "png" }).then((result) => fs.writeFileSync(path.join(output, `details-${width}.png`), Buffer.from(result.data, "base64")));
    await click('#loadMoreSupportHistory');
    await waitFor("document.querySelectorAll('.support-audit-message').length === 57");
    assert.equal(await evaluate("document.querySelectorAll('#supportRequestHistory script, #supportRequestDetailsDialog textarea').length"), 0);
    await click('#closeSupportRequestDetails');
    await waitFor("!document.querySelector('#supportRequestDetailsDialog').open");
  }
  assert.equal(await evaluate("fixture.calls.some(c=>c.rpc && /reply|claim|resolve|mark_support/.test(c.rpc))"), false);
  await evaluate("fixture.failList=true");
  await click('#refreshSupportOversight');
  await waitFor("document.querySelector('#supportRequestListStatus').textContent.includes('could not be loaded')");
  assert.equal(await evaluate("document.querySelectorAll('#supportRequestRows tr').length"), 0);
  assert.deepEqual(await evaluate("fixture.errors"), []);
  console.log("PASS admin overview, pagination, search, empty/error states, conversation pagination, escaped content, read-only calls");
  console.log("PASS list/detail overflow at 1440, 1024, 768, 375px");
  console.log(`Screenshots: ${output}`);
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { ws?.close(); chrome?.kill(); server.close(); });
