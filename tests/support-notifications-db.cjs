// Install pinned local test dependencies with the command in docs/support-notifications.md.
// Real PostgreSQL (PGlite), isolated in memory; pg_net/cron/Vault adapters mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('../.tmp/support-tests/node_modules/@electric-sql/pglite');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const db = new PGlite();
const read = file => fs.readFileSync(`supabase/migrations/${file}`, 'utf8');
const load = async file => db.exec(read(file).replace(/create extension if not exists pg_(?:cron|net) with schema extensions;/gi, ''));
const uid = async n => db.query("select set_config('request.jwt.claim.sub', $1, false)", [n ? id(n) : '']);
const as = async (n, sql, params = []) => { await uid(n); await db.exec('set role authenticated'); try { return await db.query(sql, params); } finally { await db.exec('reset role'); } };
const count = async () => Number((await db.query('select count(*) as count from public.support_email_notifications')).rows[0].count);
const guards = async () => (await db.query(`select proname, pg_get_functiondef(oid) as definition from pg_proc
  where pronamespace = 'public'::regnamespace and proname in ('reply_to_support_request','resolve_support_request','add_customer_support_message','prevent_support_lifecycle_updates') order by proname`)).rows;
const policies = async () => (await db.query("select * from pg_policies where schemaname='public' and tablename in ('support_requests','support_messages','support_users') order by tablename,policyname")).rows;
const rejects = async task => { let error; try { await task(); } catch (caught) { error = caught; } assert(error, 'Expected authorization/lifecycle failure'); };
(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema cron; create schema vault; create schema net; create schema extensions;
    create table auth.users(id uuid primary key, email text);
    create table public.profiles(id uuid primary key references auth.users, email text, first_name text, last_name text);
    create table public.admin_users(user_id uuid primary key references auth.users);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon, authenticated, service_role;
    create table cron.jobs(name text, schedule text, command text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.jobs values($1,$2,$3);select 1::bigint$$;
    create table vault.decrypted_secrets(name text, decrypted_secret text);
    create table net.calls(url text, body jsonb, headers jsonb);
    create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 1000)
      returns bigint language sql as $$insert into net.calls values($1,$2,$4);select 1::bigint$$;`);
  for (let n = 1; n <= 4; n++) {
    await db.query('insert into auth.users values($1,$2)', [id(n), `registered${n}@example.test`]);
    await db.query('insert into public.profiles values($1,$2,$3,$4)', [id(n), `snapshot${n}@example.test`, 'Fixture', String(n)]);
  }
  await db.query('insert into public.admin_users values($1)', [id(4)]);
  await load('20260930151003_support_system_foundation.sql');
  await load('20261001120000_support_unread_read_state.sql');
  await load('20261004130000_support_lifecycle_retention.sql');
  await as(4, 'select public.admin_grant_support_membership($1)', [id(3)]);
  const request = (await as(1, "select public.create_authenticated_support_request('Missing ticket','order','Please help') as id")).rows[0].id;
  await as(3, "select public.reply_to_support_request($1,'Historical reply')", [request]);
  const originalGuards = await guards(), originalPolicies = await policies();
  await load('20261006111828_support_transactional_notifications.sql');
  assert.equal(await count(), 0, 'No historical backfill');
  assert.deepEqual(await guards(), originalGuards); assert.deepEqual(await policies(), originalPolicies);
  assert.equal((await db.query("select schedule from cron.jobs where name='support-transactional-email-worker'")).rows[0].schedule, '* * * * *');
  console.log('PASS original Support RPCs/RLS/lifecycle unchanged, no backfill, minute scheduler');

  await as(3, 'select public.claim_support_request($1)', [request]);
  await as(4, 'select public.assign_support_request($1,$2)', [request, id(3)]);
  await as(1, "select public.add_customer_support_message($1,'Customer reply')", [request]);
  await as(1, 'select public.mark_support_request_read($1)', [request]);
  await as(3, 'select public.mark_support_request_read($1)', [request]);
  assert.equal(await count(), 0, 'Non-notifying operations');
  for (const actor of [1, 2, 4]) {
    await rejects(() => as(actor, "select public.reply_to_support_request($1,'Unauthorized')", [request]));
    await rejects(() => as(actor, 'select public.resolve_support_request($1)', [request]));
    await rejects(() => as(actor, 'select * from public.support_email_notifications'));
    await rejects(() => as(actor, 'select public.claim_support_email_notifications()'));
    await rejects(() => as(actor, 'select public.dispatch_support_email_notifications()'));
  }
  await rejects(() => as(3, 'select * from public.support_email_notifications'));
  await uid(null); await db.exec('set role anon');
  await rejects(() => db.query('select * from public.support_email_notifications'));
  await rejects(() => db.query('select public.claim_support_email_notifications()')); await db.exec('reset role');
  console.log('PASS customer/Admin/anon cannot act as Support, access outbox or trigger worker; no queue events for customer/read/claim/assign');

  const reply = (await as(3, "select public.reply_to_support_request($1,'Saved new reply') as id", [request])).rows[0].id;
  assert.equal(await count(), 1);
  const queued = (await db.query('select * from public.support_email_notifications')).rows[0];
  assert.equal(queued.support_message_id, reply); assert.equal(queued.actor_user_id, id(3)); assert.equal(queued.kind, 'reply');
  assert(!('customer_email' in queued)); assert(!('body' in queued));
  await db.exec('set role service_role');
  const claimed = (await db.query('select * from public.claim_support_email_notifications()')).rows;
  assert.equal(claimed.length, 1); assert.equal((await db.query('select * from public.claim_support_email_notifications()')).rows.length, 0);
  const item = claimed[0];
  await db.query("update public.support_email_notifications set payload=$2::jsonb where id=$1", [item.id, JSON.stringify({ to: ['registered1@example.test'], html: 'Short preview' })]);
  assert.equal((await db.query("select public.finish_support_email_notification($1,$2,'retry','PROVIDER_HTTP_503') as ok", [item.id, item.lease_token])).rows[0].ok, true);
  assert.equal((await db.query("select public.finish_support_email_notification($1,$2,'sent') as ok", [item.id, item.lease_token])).rows[0].ok, false, 'Old lease cannot complete twice');
  await db.exec('reset role');
  assert.equal((await db.query('select body from public.support_messages where id=$1', [reply])).rows[0].body, 'Saved new reply');
  assert.equal(Number((await db.query('select count(*) as count from public.support_messages where id=$1', [reply])).rows[0].count), 1);
  await as(1, "select public.add_customer_support_message($1,'Customer can still reply')", [request]);
  assert.equal(await count(), 1);
  await as(3, 'select public.resolve_support_request($1)', [request]);
  await as(3, 'select public.resolve_support_request($1)', [request]);
  assert.equal(await count(), 2, 'Only first resolution transition enqueues');
  await db.exec('set role service_role');
  const resolution = (await db.query('select * from public.claim_support_email_notifications()')).rows[0];
  assert.equal(resolution.kind, 'resolved');
  await db.query("select public.finish_support_email_notification($1,$2,'retry','PROVIDER_HTTP_500')", [resolution.id, resolution.lease_token]);
  await db.exec('reset role');
  assert.equal((await db.query('select status from public.support_requests where id=$1', [request])).rows[0].status, 'resolved');
  await rejects(() => as(1, "select public.add_customer_support_message($1,'Cannot reopen')", [request]));
  await rejects(() => as(3, "select public.reply_to_support_request($1,'Cannot reply to resolved')", [request]));
  assert.equal(await count(), 2, 'Rollback of failed reply also rolls back event');
  assert.equal((await as(1, 'select * from public.support_requests where id=$1', [request])).rows.length, 1);
  assert.equal((await as(2, 'select * from public.support_requests where id=$1', [request])).rows.length, 0);
  console.log('PASS reply stored once, resolution stored once in outbox, provider failures preserve actions, resolved read-only, foreign-request RLS');

  await db.query("update public.support_email_notifications set next_attempt_at=now()-interval '1 minute' where kind='reply'");
  const retry = (await db.query('select * from public.claim_support_email_notifications()')).rows[0];
  assert.equal(retry.id, item.id); assert.equal(retry.attempts, 2); assert.notEqual(retry.lease_token, item.lease_token);
  assert.deepEqual(retry.payload.to, ['registered1@example.test']);
  assert.equal((await db.query("select public.finish_support_email_notification($1,$2,'sent') as ok", [retry.id, item.lease_token])).rows[0].ok, false);
  await db.query("update public.support_email_notifications set lease_expires_at=now()-interval '1 minute' where id=$1", [retry.id]);
  const recovered = (await db.query('select * from public.claim_support_email_notifications()')).rows[0];
  assert.equal(recovered.id, retry.id); assert.equal(recovered.attempts, 3);
  await db.query("select public.finish_support_email_notification($1,$2,'sent',null,'provider-1')", [recovered.id, recovered.lease_token]);
  assert.equal((await db.query('select payload from public.support_email_notifications where id=$1', [recovered.id])).rows[0].payload, null);
  assert.equal((await db.query('select * from public.claim_support_email_notifications()')).rows.length, 0);
  await db.query("update public.support_email_notifications set first_attempt_at=now()-interval '24 hours',next_attempt_at=now()-interval '1 minute',payload='{}'::jsonb where kind='resolved'");
  assert.equal((await db.query('select * from public.claim_support_email_notifications()')).rows.length, 0);
  const expired = (await db.query("select status,payload from public.support_email_notifications where kind='resolved'")).rows[0];
  assert.equal(expired.status, 'failed'); assert.equal(expired.payload, null);
  console.log('PASS leases, duplicate claim suppression, stale completion rejection, crash recovery, terminal sent state and retry-window expiry');

  const hidden = (await as(1, "select public.create_authenticated_support_request('Hidden','general','Help') as id")).rows[0].id;
  await as(1, 'select public.delete_customer_support_request($1)', [hidden]);
  const beforeHidden = await count();
  await rejects(() => as(3, 'select public.resolve_support_request($1)', [hidden]));
  await rejects(() => as(3, "select public.reply_to_support_request($1,'Not deliverable')", [hidden]));
  assert.equal(await count(), beforeHidden);
  assert.equal((await as(1, 'select * from public.support_requests where id=$1', [hidden])).rows.length, 0);
  assert.equal((await as(1, 'select * from public.support_messages where support_request_id=$1', [hidden])).rows.length, 0);
  const pending = (await as(1, "select public.create_authenticated_support_request('Scheduler','general','Help') as id")).rows[0].id;
  await as(3, "select public.reply_to_support_request($1,'Scheduler reply')", [pending]);
  await uid(null);
  assert.equal((await db.query('select public.dispatch_support_email_notifications() as result')).rows[0].result, null, 'Missing worker config keeps queue pending');
  await db.query('insert into vault.decrypted_secrets values($1,$2),($3,$4)', ['support_notifications_url','https://aswiwlyydesskwvehmej.supabase.co/functions/v1/support-notifications','support_notifications_worker_key','x'.repeat(64)]);
  await db.query('select public.dispatch_support_email_notifications()');
  const dispatch = (await db.query('select url,body from net.calls')).rows[0];
  assert.equal(dispatch.url, 'https://aswiwlyydesskwvehmej.supabase.co/functions/v1/support-notifications'); assert.deepEqual(dispatch.body, {});
  await db.query("update public.support_email_notifications set attempts=6,first_attempt_at=now(),payload='{}'::jsonb where support_request_id=$1", [pending]);
  assert.equal((await db.query('select * from public.claim_support_email_notifications()')).rows.length, 0);
  assert.equal((await db.query('select status from public.support_email_notifications where support_request_id=$1', [pending])).rows[0].status, 'failed');
  // Existing cleanup owns retention; request purges cascade into notification history.
  await db.query("update public.support_requests set created_at=now()-interval '100 days',resolved_at=now()-interval '91 days' where id=$1", [request]);
  await db.query('select public.cleanup_support_history()');
  assert.equal((await db.query('select * from public.support_email_notifications where support_request_id=$1', [request])).rows.length, 0);
  const beforeRevocation = await count();
  await as(4, 'select public.admin_revoke_support_membership($1)', [id(3)]);
  await rejects(() => as(3, "select public.reply_to_support_request($1,'Revoked employee')", [pending]));
  await rejects(() => as(3, 'select public.resolve_support_request($1)', [pending]));
  assert.equal(await count(), beforeRevocation);
  console.log('PASS customer-hidden RLS/lifecycle, scheduler configuration guard/private empty payload, existing 90-day purge cascades');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.close());
