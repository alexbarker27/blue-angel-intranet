/* ──────────────────────────────────────────────────────────────────────────
   Blue Angel Coverage Requests — shared data + helpers.

   localStorage-backed (per-device) until a real backend exists; only this file
   changes when that lands. Depends on forum.js for forumIdentity() and
   forumRelativeTime(), so include forum.js first.

   File attachments are stored as base64 data URLs in localStorage. That's fine
   for small prep-plan files in this prototype (files are capped ~1 MB each);
   real large-file transfer arrives with the backend.
   ────────────────────────────────────────────────────────────────────────── */

const COVERAGE_KEY = 'bacp_coverage_v1';
const COVERAGE_MAX_FILE = 1024 * 1024; // ~1 MB per file (prototype localStorage limit)

/* Seeded with one staff-submitted request so the board isn't empty. Delete-able. */
function coverageSeed() {
  const daysAgo = n => Date.now() - n * 86400000;
  return [{
    id: 'cov-seed-1',
    title: 'Coverage needed — Friday travel-medicine intakes (Dr. Daniher out)',
    requesterName: 'Shawna Guzman',
    requesterKey: 'staff:both:shawna.guzman@blueangelclinical.com',
    requesterRole: 'staff',
    practice: 'Blue Angel Combined Staff Workspace',
    timeframe: 'This Friday, all day',
    prepPlan: "Dr. Daniher is out this Friday and two travel-medicine intakes need a covering physician.\n\nPrep plan:\n1. Review each patient's itinerary and immunization history in the Travel Kit before the visit.\n2. Confirm required vaccines are in stock; flag anything to order.\n3. Use the standard travel-medicine intake form; note allergies and current meds.\n4. Message Shawna for anything you'd like pulled ahead of time.",
    attachments: [],
    status: 'open',           // open | covered | closed
    coveredByName: null, coveredByKey: null, coveredAt: null,
    responses: [],
    createdAt: daysAgo(1)
  }];
}

function loadCoverage() {
  try { const raw = localStorage.getItem(COVERAGE_KEY); if (raw) return JSON.parse(raw); }
  catch (e) {}
  const seed = coverageSeed();
  saveCoverage(seed);
  return seed;
}
function saveCoverage(list) {
  try { localStorage.setItem(COVERAGE_KEY, JSON.stringify(list)); return true; }
  catch (e) { return false; }   // e.g. quota exceeded by large attachments
}

function coverageActivity(r) {
  let t = r.createdAt || 0;
  if (r.coveredAt && r.coveredAt > t) t = r.coveredAt;
  (r.responses || []).forEach(x => { if (x.createdAt > t) t = x.createdAt; });
  return t;
}

/* ── Per-account read tracking (drives the "new" state + bell). ── */
function coverageReadKey(acct) { return 'bacp_coverage_read_' + (acct || 'anon'); }
function getCoverageReadMap(acct) {
  try { return JSON.parse(localStorage.getItem(coverageReadKey(acct)) || '{}') || {}; }
  catch (e) { return {}; }
}
function markCoverageRead(acct, id) {
  const m = getCoverageReadMap(acct);
  m[id] = Date.now();
  try { localStorage.setItem(coverageReadKey(acct), JSON.stringify(m)); } catch (e) {}
}
function isCoverageUnread(r, acct, name) {
  const lastRead = getCoverageReadMap(acct)[r.id] || 0;
  if (r.createdAt > lastRead && r.requesterName !== name) return true;
  if (r.coveredAt && r.coveredAt > lastRead && r.coveredByKey && r.coveredByKey !== acct) return true;
  return (r.responses || []).some(x => x.createdAt > lastRead && x.authorKey !== acct);
}

/* ── Mutations ── */
function submitCoverageRequest(req) {
  const list = loadCoverage();
  const full = Object.assign({
    id: 'cov' + Date.now(), attachments: [], status: 'open',
    coveredByName: null, coveredByKey: null, coveredAt: null,
    responses: [], createdAt: Date.now()
  }, req);
  list.unshift(full);
  return saveCoverage(list) ? full : null;
}
function addCoverageResponse(id, response) {
  const list = loadCoverage();
  const r = list.find(x => x.id === id);
  if (!r) return false;
  r.responses = r.responses || [];
  r.responses.push(Object.assign({ id: 'cr' + Date.now(), attachments: [], createdAt: Date.now() }, response));
  return saveCoverage(list);
}
function claimCoverage(id, coverName, coverKey) {
  const list = loadCoverage();
  const r = list.find(x => x.id === id);
  if (!r) return;
  r.status = 'covered'; r.coveredByName = coverName; r.coveredByKey = coverKey; r.coveredAt = Date.now();
  saveCoverage(list);
}
function releaseCoverage(id) {
  const list = loadCoverage();
  const r = list.find(x => x.id === id);
  if (!r) return;
  r.status = 'open'; r.coveredByName = null; r.coveredByKey = null; r.coveredAt = null;
  saveCoverage(list);
}
function setCoverageStatus(id, status) {
  const list = loadCoverage();
  const r = list.find(x => x.id === id);
  if (!r) return;
  r.status = status;
  saveCoverage(list);
}
function deleteCoverageRequest(id, requesterKey) {
  saveCoverage(loadCoverage().filter(r => !(r.id === id && r.requesterKey === requesterKey)));
}

/* ── Notifications for the dashboard bell. ── */
function getCoverageNotifications(acct, name) {
  const reqs = loadCoverage();
  const readMap = getCoverageReadMap(acct);
  const items = [];
  reqs.forEach(r => {
    const lastRead = readMap[r.id] || 0;
    if (r.requesterKey === acct) {
      // Activity on a request I posted.
      let newest = 0, subject = '';
      if (r.coveredByKey && r.coveredByKey !== acct && (r.coveredAt || 0) > lastRead && r.coveredAt > newest) {
        newest = r.coveredAt; subject = r.coveredByName + ' is covering your request';
      }
      (r.responses || []).forEach(rp => {
        if (rp.createdAt > lastRead && rp.authorKey !== acct && rp.createdAt > newest) {
          newest = rp.createdAt; subject = rp.author + ' replied on your request';
        }
      });
      if (newest > 0) items.push({ module: 'coverage', covId: r.id, subject, text: r.title, ts: newest });
    } else if (r.status === 'open' && r.createdAt > lastRead && r.requesterName !== name) {
      // A new open coverage request from someone else.
      items.push({ module: 'coverage', covId: r.id, subject: 'Coverage request from ' + r.requesterName, text: r.title, ts: r.createdAt });
    }
  });
  items.sort((a, b) => b.ts - a.ts);
  return items;
}
