// content.js
// Runs inside classroom.google.com with your current login session.
// Crawls course list, visits each course page (via fetch + DOMParser),
// extracts basic assignments + announcements + links,
// and sends structured data to background to build a ZIP.

// Utilities
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const absolute = (u) => {
  try { return new URL(u, location.origin).href; } catch { return u; }
};
const uniq = (arr) => Array.from(new Set(arr));

// Simple selectors that are reasonably stable:
// - Courses: links containing "/c/" from the left drawer & dashboard cards
// - Assignments/Announcements: we’ll parse major anchors + surrounding text

// SAFER fetchDOM
async function fetchDOM(url) {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return new DOMParser().parseFromString(html, 'text/html');
  } catch (err) {
    console.warn('fetchDOM failed for', url, err);
    return new DOMParser().parseFromString('<html></html>', 'text/html'); // empty fallback
  }
}

function safeText(el) {
  return (el?.textContent || '').replace(/\s+/g, ' ').trim();
}

function pickLinks(container) {
  return uniq(
    Array.from(container.querySelectorAll('a[href]'))
      .map(a => a.getAttribute('href'))
      .filter(Boolean)
      .map(absolute)
      // keep only meaningful google links or http(s)
      .filter(u =>
        /^https?:\/\//i.test(u) &&
        !u.startsWith('chrome-extension://')
      )
  );
}

// Try to extract assignments-ish blocks by common patterns:
// We don’t rely on exact classnames (which change often). We look for anchors
// that lead to /a/ or /t/ or contain “work” patterns, then collect surrounding text.
function extractAssignments(doc) {
  const anchors = Array.from(doc.querySelectorAll('a[href*="/a/"], a[href*="/t/"], a[href*="coursework"], a[href*="/w/"]'));
  const items = [];

  anchors.forEach(a => {
    const href = a.getAttribute('href');
    const title = safeText(a);
    const card = a.closest('[role="listitem"], div, section') || a.parentElement;

    // try to find nearby description and due text
    let description = '';
    let due = '';

    // search within the card for small text nodes and time/due labels
    const smalls = Array.from(card.querySelectorAll('div, span, p')).slice(0, 40);
    const textBlob = smalls.map(safeText).filter(Boolean).join(' • ');

    // heuristic "Due" pickup
    const dueMatch = textBlob.match(/\b(Due|DUE)\b[^•]{0,40}/);
    if (dueMatch) due = dueMatch[0].replace(/\s+/g, ' ').trim();

    // description: first decent chunk that’s not the title or due
    const descCand = smalls.map(safeText).filter(Boolean).find(t => t.length > 20 && !t.includes(title) && (!due || !t.includes(due)));
    if (descCand) description = descCand;

    const links = pickLinks(card);

    items.push({
      title,
      url: absolute(href),
      description,
      due,
      links
    });
  });

  // Deduplicate by title+url
  const keyset = new Set();
  return items.filter(it => {
    const k = `${it.title}::${it.url}`;
    if (keyset.has(k)) return false;
    keyset.add(k);
    return true;
  });
}

function extractAnnouncements(doc) {
  // Announcements often appear as posts/stream items with main text and time
  const containers = Array.from(doc.querySelectorAll('[role="listitem"], article, .YVvGBb, .JwPp0e, .z3vRcc, .z3vRcc+div'));
  const anns = [];

  containers.forEach(c => {
    const text = safeText(c);
    if (!text || text.length < 10) return;

    // Look for a timestamp-like string
    const timeMatch = text.match(/\b(\d{1,2}:\d{2}\s?(AM|PM))\b|\b(\d{1,2}\s\w+\s\d{4})\b/i);
    const links = pickLinks(c);

    // Heuristic: treat items with some Classroom/Docs links and a chunk of text as announcement-ish
    if (links.length || text.length > 40) {
      anns.push({
        text,
        time: timeMatch ? timeMatch[0] : '',
        links
      });
    }
  });

  // Keep the first N unique announcements by text hash
  const seen = new Set();
  const out = [];
  for (const a of anns) {
    const key = (a.text || '').slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
    if (out.length > 100) break;
  }
  return out;
}

async function crawlCoursesFromDashboard() {
  // Collect course links from dashboard & left drawer
  const anchors = Array.from(document.querySelectorAll('a[href*="/c/"]'));
  const urls = uniq(
    anchors
      .map(a => a.getAttribute('href'))
      .filter(Boolean)
      .map(absolute)
      // keep only classroom course roots like .../c/{id}
      .map(u => u.split('?')[0])
      .map(u => u.replace(/(\/a\/.*)$/,''))
  );

  // Also capture titles from visible cards
  const titled = [];
  const cardEls = Array.from(document.querySelectorAll('[role="link"][href*="/c/"], a[href*="/c/"]'));
  const mapTitleByUrl = new Map();
  cardEls.forEach(a => {
    const url = absolute(a.getAttribute('href') || '');
    const title = safeText(a);
    if (url && title) mapTitleByUrl.set(url.split('?')[0], title);
  });

  // Build course list with title (fallback to URL tail)
  const courses = urls.map(u => ({
    url: u,
    title: mapTitleByUrl.get(u) || decodeURIComponent(u.split('/').filter(Boolean).slice(-1)[0]) || 'Course'
  }));

  return courses;
}

async function crawlCourseDetail(course) {
  // Fetch main course page
  const doc = await fetchDOM(course.url);

  // Try to find tabs: "Classwork" / "Stream" / etc, then fetch Classwork page if available
  const classworkTab = doc.querySelector('a[href*="/c/"][href*="/w"]') || doc.querySelector('a[href*="classwork"]');
  let classworkDoc = doc;
  if (classworkTab) {
    try {
      classworkDoc = await fetchDOM(absolute(classworkTab.getAttribute('href')));
    } catch {}
  }

  const assignments = extractAssignments(classworkDoc);
  const announcements = extractAnnouncements(doc); // stream/home often on the main page

  // Topics are messy; best-effort from headings on classwork page
  // Assign a topic to each assignment based on nearest section heading
  const topicHeadings = Array.from(classworkDoc.querySelectorAll('h2, h3, [role="heading"]')).map(h => ({
    el: h, text: (h.textContent || '').trim()
  })).filter(h => h.text && h.text.length < 80);

  assignments.forEach(a => {
    let topic = 'No Topic';
    let node;
    try {
      node = classworkDoc.querySelector(`a[href="${(new URL(a.url)).pathname}"]`);
    } catch {
      node = null;
    }
    if (node) {
      // Walk up to find nearest heading
      let p = node;
      while (p && p !== classworkDoc.body) {
        const heading = p.querySelector('h2, h3, [role="heading"]');
        if (heading && (heading.textContent || '').trim()) {
          topic = (heading.textContent || '').trim();
          break;
        }
        p = p.parentElement;
      }
    }
    a.topic = topic;
  });

  return {
    title: course.title,
    url: course.url,
    assignments,
    announcements
  };
}

async function crawlAll() {
  try {
    chrome.runtime.sendMessage({ action: 'export_progress', note: 'Scanning dashboard for courses…', percent: 10 });

    const courses = await crawlCoursesFromDashboard();
    if (!courses.length) {
      chrome.runtime.sendMessage({ action: 'export_error', error: 'No courses detected on this page. Open classroom.google.com home.' });
      return;
    }

    const out = [];
    let i = 0;
    for (const c of courses) {
      i++;
      chrome.runtime.sendMessage({ action: 'export_progress', note: `Fetching: ${c.title}`, percent: 10 + Math.round((i / courses.length) * 70) });
      const detail = await crawlCourseDetail(c);
      out.push(detail);
      await sleep(500); // be gentle
    }

    chrome.runtime.sendMessage({ action: 'export_progress', note: 'Building ZIP…', percent: 85 });
    chrome.runtime.sendMessage({ action: 'data_ready', data: { courses: out } });
  } catch (e) {
    chrome.runtime.sendMessage({ action: 'export_error', error: String(e.message || e) });
  }
}

// Listen for popup trigger
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'start_export') {
    crawlAll();
  }
});