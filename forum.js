/* ──────────────────────────────────────────────────────────────────────────
   Blue Angel Physician Forum — shared data + helpers.

   Backed by the browser's localStorage, so posts persist per-device. This is
   intentional for now: the intranet has no backend yet. When real auth + a
   backend land, only this file changes (swap localStorage for API calls);
   the forum and dashboard UIs stay the same.
   ────────────────────────────────────────────────────────────────────────── */

const FORUM_STORAGE_KEY = 'bacp_forum_threads_v1';

/* Starter content so a brand-new board isn't empty. Safe to delete in the UI. */
function forumSeedThreads() {
  const daysAgo = n => Date.now() - n * 86400000;
  return [
    {
      id: 'welcome',
      subject: 'Welcome to the Physician Forum',
      body: "This is a private space for Blue Angel physicians and staff across every practice to ask questions, compare notes on complex cases, and get a colleague's second opinion. Start a discussion with the “New Post” button, and reply to any thread to weigh in. When a question has been resolved, archive the thread to keep the board tidy.",
      author: 'Joseph Robillard',
      authorRole: 'admin',
      practice: 'Blue Angel Clinical Partners',
      createdAt: daysAgo(3),
      archived: false,
      replies: [
        {
          id: 'welcome-r1',
          author: 'Dr. Daniher',
          authorRole: 'physician',
          practice: 'Daniher Concierge Medicine',
          body: "Great to finally have this. Looking forward to comparing notes across the network as we grow.",
          createdAt: daysAgo(2)
        }
      ]
    }
  ];
}

function loadForumThreads() {
  try {
    const raw = localStorage.getItem(FORUM_STORAGE_KEY);
    if (raw) {
      const threads = JSON.parse(raw);
      // One-time cleanup: fix any legacy seed name already saved to a browser.
      let changed = false;
      const fix = who => { if (who && who.author === 'Joseph Tella') { who.author = 'Joseph Robillard'; changed = true; } };
      threads.forEach(t => { fix(t); (t.replies || []).forEach(fix); });
      if (changed) saveForumThreads(threads);
      return threads;
    }
  } catch (e) { /* ignore corrupt/blocked storage */ }
  const seed = forumSeedThreads();
  saveForumThreads(seed);
  return seed;
}

function saveForumThreads(threads) {
  try { localStorage.setItem(FORUM_STORAGE_KEY, JSON.stringify(threads)); } catch (e) {}
}

/* Most recent activity on a thread (its own time, or its newest reply). */
function forumThreadActivity(t) {
  let latest = t.createdAt || 0;
  (t.replies || []).forEach(r => { if (r.createdAt > latest) latest = r.createdAt; });
  return latest;
}

/* ── Per-user READ tracking — drives the gold "new" accent. A thread stays
   unread (gold) until THIS user opens it; stored per-user so it survives
   logout/login. Map of { threadId: lastReadTimestamp }. ── */
function forumReadKey(email) { return 'bacp_forum_read_' + (email || 'anon'); }

function getForumReadMap(email) {
  try { return JSON.parse(localStorage.getItem(forumReadKey(email)) || '{}') || {}; }
  catch (e) { return {}; }
}

function markThreadRead(email, threadId) {
  const map = getForumReadMap(email);
  map[threadId] = Date.now();
  try { localStorage.setItem(forumReadKey(email), JSON.stringify(map)); } catch (e) {}
}

/* True if a thread has activity by someone OTHER than this user since they
   last opened it (or they've never opened it). */
function isThreadUnread(t, email, displayName) {
  const lastRead = getForumReadMap(email)[t.id] || 0;
  if (t.createdAt > lastRead && t.author !== displayName) return true;
  return (t.replies || []).some(r => r.createdAt > lastRead && r.author !== displayName);
}

/* ── Per-user PERSONAL archive — a non-author can hide a thread for themselves
   only; everyone else still sees it. (The original author archives globally
   via the thread's own `archived` flag.) ── */
function forumHiddenKey(email) { return 'bacp_forum_hidden_' + (email || 'anon'); }

function getForumHidden(email) {
  try { return JSON.parse(localStorage.getItem(forumHiddenKey(email)) || '[]') || []; }
  catch (e) { return []; }
}
function setForumHidden(email, ids) {
  try { localStorage.setItem(forumHiddenKey(email), JSON.stringify(ids)); } catch (e) {}
}
function addForumHidden(email, threadId) {
  const ids = getForumHidden(email);
  if (!ids.includes(threadId)) { ids.push(threadId); setForumHidden(email, ids); }
}
function removeForumHidden(email, threadId) {
  setForumHidden(email, getForumHidden(email).filter(id => id !== threadId));
}

/* A thread is archived FOR A GIVEN USER if the author archived it globally,
   or this user personally hid it. */
function isThreadArchivedFor(t, email) {
  return !!t.archived || getForumHidden(email).includes(t.id);
}

/* ── Notifications for the dashboard bell dropdown: one row per thread that has
   unread activity by others (excludes archived/hidden threads). Other modules
   (Coverage Requests, etc.) can append their own items to the same list. ── */
function getForumNotifications(email, displayName) {
  const threads = loadForumThreads();
  const readMap = getForumReadMap(email);
  const hidden  = getForumHidden(email);
  const items = [];
  threads.forEach(t => {
    if (t.archived || hidden.includes(t.id)) return;
    const lastRead = readMap[t.id] || 0;
    let newest = 0, newestAuthor = '', newReplies = 0, threadIsNew = false;
    if (t.createdAt > lastRead && t.author !== displayName) { threadIsNew = true; newest = t.createdAt; newestAuthor = t.author; }
    (t.replies || []).forEach(r => {
      if (r.createdAt > lastRead && r.author !== displayName) {
        newReplies++;
        if (r.createdAt > newest) { newest = r.createdAt; newestAuthor = r.author; }
      }
    });
    if (newest > 0) {
      items.push({
        module: 'forum',
        threadId: t.id,
        subject: t.subject,
        practice: t.practice,
        ts: newest,
        text: threadIsNew ? ('New post from ' + t.author)
                          : (newReplies + (newReplies === 1 ? ' new reply' : ' new replies') + ' from ' + newestAuthor)
      });
    }
  });
  items.sort((a, b) => b.ts - a.ts);
  return items;
}

function getForumNewCount(email, displayName) {
  return getForumNotifications(email, displayName).length;
}

/* Resolve the signed-in identity from the URL params shared across pages,
   so the forum and dashboard attribute posts to the same name. */
function forumIdentity(params) {
  const practice = params.get('practice') || 'sujansky';
  const role     = params.get('role') === 'staff' ? 'staff' : 'physician';
  const email    = params.get('email') || '';

  const physicianNames = { sujansky: 'Dr. Sujansky', daniher: 'Dr. Daniher' };
  const practiceLabels = {
    sujansky: 'Sujansky Concierge Medicine',
    daniher:  'Daniher Concierge Medicine',
    both:     'Blue Angel Combined Staff Workspace',
    other:    'Your Practice'
  };

  let name;
  if (role === 'physician') {
    name = physicianNames[practice] || 'Physician';
  } else {
    const parts = (email.split('@')[0] || 'staff').split('.');
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    name = (cap(parts[0]) + ' ' + cap(parts[1] || '')).trim() || 'Staff';
  }

  return {
    name, role, email, practice,
    practiceLabel: role === 'staff' ? practiceLabels.both : (practiceLabels[practice] || 'Your Practice'),
    // Unique per account so notification/read/archive state never bleeds between
    // users. No real auth yet, so role+practice+email distinguishes Daniher vs
    // Sujansky vs Shawna even when they share the demo email.
    accountKey: role + ':' + practice + ':' + email
  };
}

/* Compact relative time, e.g. "just now", "3h ago", "2d ago", "Apr 14". */
function forumRelativeTime(ts) {
  const diff = Date.now() - ts;
  const min = 60000, hr = 3600000, day = 86400000;
  if (diff < min) return 'just now';
  if (diff < hr)  return Math.floor(diff / min) + 'm ago';
  if (diff < day) return Math.floor(diff / hr) + 'h ago';
  if (diff < 7 * day) return Math.floor(diff / day) + 'd ago';
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
