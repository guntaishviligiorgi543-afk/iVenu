const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Usage: node tests/homepage-upcoming-shows-http.cjs <expected saved limit>
// Uses only the public API key; never signs in or changes configuration.
async function main() {
  const expected = Number(process.argv[2]);
  assert(Number.isInteger(expected) && expected > 0, 'Provide the expected saved limit');
  const config = fs.readFileSync(path.join(__dirname, '../supabase-config.js'), 'utf8');
  const url = config.match(/url: "([^"]+)"/)[1];
  const apikey = config.match(/publishableKey: "([^"]+)"/)[1];
  const headers = { apikey, 'Content-Type': 'application/json' };
  const read = await fetch(`${url}/rest/v1/rpc/get_homepage_upcoming_shows`, {
    method: 'POST', headers, body: '{}',
  });
  const shows = await read.json();
  assert.equal(read.status, 200, JSON.stringify(shows));
  assert.equal(shows.length, expected, 'Homepage RPC did not use the saved limit');
  console.log(`Public read: HTTP 200; ${shows.length} shows`);

  const write = await fetch(`${url}/rest/v1/rpc/admin_save_homepage_upcoming_shows_config`, {
    method: 'POST', headers, body: JSON.stringify({ p_display_limit: expected }),
  });
  const denial = await write.json();
  assert.equal(write.status, 401, JSON.stringify(denial));
  assert.equal(denial.code, '42501', 'Expected permission denial, not a schema-cache error');
  console.log(`Anonymous write: HTTP ${write.status}; ${denial.code}; ${denial.message}`);

  const adminResponse = await fetch('https://ivenue.site/admin-dashboard.js');
  assert.equal(adminResponse.status, 200);
  const adminScript = await adminResponse.text();
  assert.match(adminScript, /client\.rpc\(\s*"admin_save_homepage_upcoming_shows_config",\s*\{\s*p_display_limit: displayLimit/);
  const homepageResponse = await fetch('https://ivenue.site/index.js');
  assert.equal(homepageResponse.status, 200);
  const homepageScript = await homepageResponse.text();
  assert.match(homepageScript, /getHomepageUpcomingShows\(\)/);
  assert.match(homepageScript, /upcomingEvents\.forEach\(renderAccordion\)/);
  console.log('Deployed Admin contract and homepage rendering path verified');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
