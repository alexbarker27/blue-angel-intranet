/* ──────────────────────────────────────────────────────────────────────────
   Blue Angel Specialist Network — shared data + helpers.

   Like the forum, this is localStorage-backed (per-device) until a real backend
   exists; only this file changes when that lands. Depends on forum.js for
   forumIdentity()/forumRelativeTime(), so include forum.js first.

   Privacy: specialists' own contact info is intentionally NOT stored here. To
   reach a specialist you send a referral request to the BACP physician who owns
   that relationship; they connect you offline.
   ────────────────────────────────────────────────────────────────────────── */

const SPECIALISTS_KEY = 'bacp_specialists_v1';
const REFERRALS_KEY   = 'bacp_referrals_v1';
const SPECIALIST_CONTRIB_REQUIRED = 5;   // contributions needed to unlock viewing

/* Demo account keys (role:practice:email) for the seeded owners — these match
   the skip-sign-in demo identities so both lock states are visible out of the box. */
const SEED_DANIHER_KEY  = 'physician:daniher:demo@blueangelclinical.com';
const SEED_SUJANSKY_KEY = 'physician:sujansky:demo@blueangelclinical.com';

/* Example directory entries (clearly sample data — safe to delete in the UI).
   Daniher owns 5 → unlocked; Sujansky owns 2 → locked, to show the gate. */
function specialistSeed() {
  const daysAgo = n => Date.now() - n * 86400000;
  const D = { owner: 'Dr. Daniher', ownerKey: SEED_DANIHER_KEY, ownerPractice: 'Daniher Concierge Medicine' };
  const S = { owner: 'Dr. Sujansky', ownerKey: SEED_SUJANSKY_KEY, ownerPractice: 'Sujansky Concierge Medicine' };
  return [
    { id: 'sp-1', name: 'Dr. Helen Cho',        specialty: 'Cardiology',       location: 'San Francisco, CA', notes: 'Structural heart; fast turnaround on urgent consults.', createdAt: daysAgo(40), ...D },
    { id: 'sp-2', name: 'Dr. Marcus Reyes',     specialty: 'Dermatology',      location: 'San Mateo, CA',     notes: 'Skin cancer screening and Mohs surgery.',               createdAt: daysAgo(36), ...D },
    { id: 'sp-3', name: 'Dr. Priya Nair',       specialty: 'Orthopedics',      location: 'San Francisco, CA', notes: 'Sports medicine, shoulder and knee.',                    createdAt: daysAgo(30), ...D },
    { id: 'sp-4', name: 'Dr. Daniel Okafor',    specialty: 'Endocrinology',    location: 'Palo Alto, CA',     notes: 'Complex diabetes and thyroid management.',               createdAt: daysAgo(24), ...D },
    { id: 'sp-5', name: 'Dr. Sofia Marchetti',  specialty: 'Gastroenterology', location: 'San Mateo, CA',     notes: 'IBD and advanced endoscopy.',                            createdAt: daysAgo(18), ...D },
    { id: 'sp-6', name: 'Dr. Aaron Feldman',    specialty: 'Neurology',        location: 'San Francisco, CA', notes: 'Headache and movement disorders.',                       createdAt: daysAgo(14), ...S },
    { id: 'sp-7', name: 'Dr. Lena Petrov',      specialty: 'Rheumatology',     location: 'San Mateo, CA',     notes: 'Autoimmune and inflammatory arthritis.',                 createdAt: daysAgo(9),  ...S }
  ];
}

function loadSpecialists() {
  try {
    const raw = localStorage.getItem(SPECIALISTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  const seed = specialistSeed();
  saveSpecialists(seed);
  return seed;
}
function saveSpecialists(list) {
  try { localStorage.setItem(SPECIALISTS_KEY, JSON.stringify(list)); } catch (e) {}
}

function loadReferrals() {
  try { return JSON.parse(localStorage.getItem(REFERRALS_KEY) || '[]') || []; }
  catch (e) { return []; }
}
function saveReferrals(list) {
  try { localStorage.setItem(REFERRALS_KEY, JSON.stringify(list)); } catch (e) {}
}

/* ── Contribution gate ── */
function specialistContributionCount(accountKey) {
  return loadSpecialists().filter(s => s.ownerKey === accountKey).length;
}
function isSpecialistNetworkUnlocked(accountKey, role) {
  // Staff aren't physicians and can't contribute relationships → read-only access, ungated.
  if (role !== 'physician') return true;
  return specialistContributionCount(accountKey) >= SPECIALIST_CONTRIB_REQUIRED;
}

function addSpecialist(s) {
  const list = loadSpecialists();
  list.unshift(Object.assign({ id: 'sp' + Date.now(), notes: '', createdAt: Date.now() }, s));
  saveSpecialists(list);
}

/* ── Referral requests ── */
function submitReferralRequest({ specialistId, fromKey, fromName, fromPractice, message }) {
  const sp = loadSpecialists().find(x => x.id === specialistId);
  if (!sp) return null;
  const refs = loadReferrals();
  const req = {
    id: 'ref' + Date.now(),
    specialistId, specialistName: sp.name, specialty: sp.specialty,
    toKey: sp.ownerKey, toName: sp.owner,
    fromKey, fromName, fromPractice,
    message, createdAt: Date.now(),
    status: 'pending',      // pending | fulfilled | dismissed
    ownerRead: false,       // recipient has seen the incoming request (clears their bell)
    requesterRead: true,    // requester has no status update to see yet
    actionedAt: null
  };
  refs.unshift(req);
  saveReferrals(refs);
  return req;
}

/* Incoming requests to me (I own the specialist) — pending first. */
function getIncomingReferrals(accountKey) {
  return loadReferrals().filter(r => r.toKey === accountKey)
    .sort((a, b) => ((a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1)) || (b.createdAt - a.createdAt));
}
/* Requests I've sent (newest first). */
function getOutgoingReferrals(accountKey) {
  return loadReferrals().filter(r => r.fromKey === accountKey).sort((a, b) => b.createdAt - a.createdAt);
}
/* Do I already have an open request out for this specialist? (Prevents double-sends.) */
function hasPendingRequest(accountKey, specialistId) {
  return loadReferrals().some(r => r.fromKey === accountKey && r.specialistId === specialistId && r.status === 'pending');
}

/* Owner opened their Requests inbox → clear "new request" notifications. */
function markIncomingRead(accountKey) {
  const refs = loadReferrals();
  let changed = false;
  refs.forEach(r => { if (r.toKey === accountKey && !r.ownerRead) { r.ownerRead = true; changed = true; } });
  if (changed) saveReferrals(refs);
}
/* Requester opened their Sent view → clear status-update notifications. */
function markOutgoingSeen(accountKey) {
  const refs = loadReferrals();
  let changed = false;
  refs.forEach(r => { if (r.fromKey === accountKey && r.status !== 'pending' && !r.requesterRead) { r.requesterRead = true; changed = true; } });
  if (changed) saveReferrals(refs);
}

/* Owner acts on a request; the requester gets notified of the outcome. */
function setReferralStatus(referralId, ownerKey, status) {
  const refs = loadReferrals();
  const r = refs.find(x => x.id === referralId && x.toKey === ownerKey);
  if (!r) return;
  r.status = status;             // 'fulfilled' | 'dismissed'
  r.actionedAt = Date.now();
  r.requesterRead = false;       // surfaces a status update to the requester
  saveReferrals(refs);
}

function deleteReferral(referralId, accountKey) {
  saveReferrals(loadReferrals().filter(r => !(r.id === referralId && (r.toKey === accountKey || r.fromKey === accountKey))));
}

/* ── Dashboard bell notifications: new incoming requests (owner) AND status
   updates on requests I sent (requester). ── */
function getSpecialistNotifications(accountKey, displayName) {
  const refs = loadReferrals();
  const items = [];
  refs.filter(r => r.toKey === accountKey && !r.ownerRead).forEach(r => {
    items.push({
      module: 'specialist', spView: 'requests', refId: r.id,
      subject: 'Referral request from ' + r.fromName,
      text: 'Re: ' + r.specialistName + ' (' + r.specialty + ')',
      practice: r.fromPractice, ts: r.createdAt
    });
  });
  refs.filter(r => r.fromKey === accountKey && r.status !== 'pending' && !r.requesterRead).forEach(r => {
    items.push({
      module: 'specialist', spView: 'sent', refId: r.id,
      subject: r.toName + ' ' + (r.status === 'fulfilled' ? 'fulfilled' : 'dismissed') + ' your referral request',
      text: 'Re: ' + r.specialistName + ' (' + r.specialty + ')',
      practice: '', ts: r.actionedAt || r.createdAt
    });
  });
  items.sort((a, b) => b.ts - a.ts);
  return items;
}
