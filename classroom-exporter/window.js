// window.js (popup)
const startBtn = document.getElementById('startBtn');
const statusEl = document.getElementById('status');
const barEl = document.getElementById('bar');

const JSZip = window.JSZip; // guaranteed by <script src="jszip.min.js">

function setStatus(s) { statusEl.textContent = s; }
function setProgress(pct) { barEl.style.width = `${Math.max(0, Math.min(100, pct))}%`; }
function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function safeName(s) {
  return (s || 'untitled')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

// Helper: Detect Google file type and ID
function detectGoogleFile(url) {
  // Docs
  let m = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return { type: 'doc', id: m[1] };
  // Sheets
  m = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return { type: 'sheet', id: m[1] };
  // Slides
  m = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return { type: 'slide', id: m[1] };
  // Drive direct download (PDF, image, etc.)
  m = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return { type: 'drivefile', id: m[1] };
  // Drive uc?export=download&id=
  m = url.match(/drive\.google\.com\/uc\?export=download&id=([a-zA-Z0-9-_]+)/);
  if (m) return { type: 'driveuc', id: m[1] };
  // PDF/image via open?id=
  m = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9-_]+)/);
  if (m) return { type: 'driveopen', id: m[1] };
  return null;
}

// Helper: Guess file extension from type or url
function guessExtension(type, url) {
  if (type === 'doc') return '.txt';
  if (type === 'sheet') return '.csv';
  if (type === 'slide') return '.pdf';
  if (type === 'drivefile' || type === 'driveuc' || type === 'driveopen') {
    // Try to guess from url
    const ext = url.match(/\.(pdf|jpg|jpeg|png|gif|docx|xlsx|pptx|zip|rar|mp4|mp3|csv|txt)(\?|$)/i);
    if (ext) return '.' + ext[1].toLowerCase();
    return '';
  }
  // Fallback
  return '';
}

// Helper: Download and attach file to zip folder
async function downloadAndAttachFile(url, folder, baseName, progressCb) {
  const info = detectGoogleFile(url);
  let fileName = safeName(baseName);
  let ext = '';
  let fileAdded = false;

  try {
    if (info) {
      if (info.type === 'doc') {
        // Google Doc as TXT
        ext = '.txt';
        const exportUrl = `https://docs.google.com/document/d/${info.id}/export?format=txt`;
        const res = await fetch(exportUrl, { credentials: 'include' });
        if (res.ok) {
          const txt = await res.text();
          folder.file(fileName + ext, txt);
          fileAdded = true;
        }
      } else if (info.type === 'sheet') {
        // Google Sheet as CSV
        ext = '.csv';
        const exportUrl = `https://docs.google.com/spreadsheets/d/${info.id}/export?format=csv`;
        const res = await fetch(exportUrl, { credentials: 'include' });
        if (res.ok) {
          const csv = await res.text();
          folder.file(fileName + ext, csv);
          fileAdded = true;
        }
      } else if (info.type === 'slide') {
        // Google Slides as PDF
        ext = '.pdf';
        const exportUrl = `https://docs.google.com/presentation/d/${info.id}/export/pdf`;
        const res = await fetch(exportUrl, { credentials: 'include' });
        if (res.ok) {
          const blob = await res.blob();
          folder.file(fileName + ext, blob);
          fileAdded = true;
        }
      } else if (info.type === 'drivefile') {
        // Google Drive file direct download
        ext = guessExtension(info.type, url) || '';
        const exportUrl = `https://drive.google.com/uc?export=download&id=${info.id}`;
        const res = await fetch(exportUrl, { credentials: 'include' });
        if (res.ok) {
          const blob = await res.blob();
          folder.file(fileName + (ext || ''), blob);
          fileAdded = true;
        }
      } else if (info.type === 'driveuc' || info.type === 'driveopen') {
        // Google Drive uc/open
        ext = guessExtension(info.type, url) || '';
        const exportUrl = `https://drive.google.com/uc?export=download&id=${info.id}`;
        const res = await fetch(exportUrl, { credentials: 'include' });
        if (res.ok) {
          const blob = await res.blob();
          folder.file(fileName + (ext || ''), blob);
          fileAdded = true;
        }
      }
    } else if (/\.pdf(\?|$)/i.test(url) || /\.(jpg|jpeg|png|gif|mp4|mp3|zip|rar|docx|xlsx|pptx|csv|txt)(\?|$)/i.test(url)) {
      // Try to fetch binary directly
      ext = guessExtension('', url) || '';
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const blob = await res.blob();
        folder.file(fileName + (ext || ''), blob);
        fileAdded = true;
      }
    }
  } catch (err) {
    // Ignore, fallback below
  }

  if (!fileAdded) {
    // Fallback: Save .url.txt with the link
    folder.file(fileName + '.url.txt', url);
  }

  if (progressCb) progressCb();
}

// Helper: Download all attachments for a list of links
async function downloadAllAttachments(links, folder, progressPrefix, progressCb) {
  if (!links || !links.length) return;
  let i = 0;
  for (const url of links) {
    i++;
    const baseName = `Attachment_${i}`;
    await downloadAndAttachFile(url, folder, baseName, () => {
      if (progressCb) progressCb(i, links.length, url);
      setStatus(`${progressPrefix} (${i}/${links.length})`);
    });
  }
}

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  setStatus('Starting export…');
  setProgress(5);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true, lastFocusedWindow: true });
  if (!tab || !tab.url || !tab.url.includes('classroom.google.com')) {
    setStatus('Open classroom.google.com first, then click Export.');
    startBtn.disabled = false;
    setProgress(0);
    return;
  }

  // try to ping content; if not present, inject then retry
  const sendStart = async () => chrome.tabs.sendMessage(tab.id, { action: 'start_export' });

  try {
    await sendStart();
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await new Promise(r => setTimeout(r, 120));
      await sendStart();
    } catch (injErr) {
      setStatus(`Could not inject content script. ${injErr?.message || injErr}`);
      startBtn.disabled = false;
      setProgress(0);
      return;
    }
  }

  setStatus('Crawling… (course list, assignments, announcements)');
  setProgress(20);
});

// receive messages
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'export_progress') {
    if (typeof msg.percent === 'number') setProgress(msg.percent);
    if (msg.note) setStatus(msg.note);
  }
  if (msg.action === 'export_error') {
    setStatus(`Error: ${msg.error || 'unknown'}`);
    startBtn.disabled = false;
    setProgress(0);
  }
  if (msg.action === 'data_ready') {
    buildZipAndDownload(msg.data).catch(err => {
      setStatus(`Zip error: ${err.message || err}`);
      startBtn.disabled = false;
      setProgress(0);
    });
  }
});

async function buildZipAndDownload(data) {
  if (!JSZip) {
    setStatus('JSZip not loaded');
    startBtn.disabled = false;
    setProgress(0);
    return;
  }

  const zip = new JSZip();
  const rootName = `ClassroomExport_${nowStamp()}`;
  const root = zip.folder(rootName);

  const courses = data?.courses || [];
  let done = 0;
  let totalSteps = 0;
  let completedSteps = 0;

  // Pre-count total steps for progress
  for (const course of courses) {
    totalSteps++; // course
    totalSteps += (course.announcements?.length || 0);
    for (const a of (course.assignments || [])) {
      totalSteps++;
      totalSteps += (a.links?.length || 0);
    }
    for (const ann of (course.announcements || [])) {
      totalSteps += (ann.links?.length || 0);
    }
  }

  for (const course of courses) {
    const courseFolder = root.folder(safeName(course.title));
    const overview = [
      `Course: ${course.title}`,
      `URL: ${course.url || ''}`,
      `ScrapedAt: ${new Date().toISOString()}`
    ].join('\n');
    courseFolder.file('_course.txt', overview);

    // Announcements
    const anns = course.announcements || [];
    if (anns.length) {
      const annFolder = courseFolder.folder('Announcements');
      let annIdx = 0;
      for (const a of anns) {
        annIdx++;
        const body = [
          `Posted: ${a.time || ''}`,
          `Text:`,
          (a.text || '').trim(),
          '',
          'Links:',
          ...(a.links || []).map(u => `- ${u}`)
        ].join('\n');
        const annFileName = `${String(annIdx).padStart(2,'0')}_announcement.txt`;
        annFolder.file(annFileName, body);

        // Attachments for announcement
        if (a.links && a.links.length) {
          const annAttachFolder = annFolder.folder(`${String(annIdx).padStart(2,'0')}_Attachments`);
          await downloadAllAttachments(
            a.links,
            annAttachFolder,
            `Downloading announcement attachments for "${course.title}"`,
            (cur, total, url) => {
              completedSteps++;
              setProgress(20 + 70 * (completedSteps / Math.max(1, totalSteps)));
            }
          );
        }
        completedSteps++;
        setProgress(20 + 70 * (completedSteps / Math.max(1, totalSteps)));
      }
    }

    // Assignments
    const assigns = course.assignments || [];
    if (assigns.length) {
      for (const a of assigns) {
        const topicFolder = courseFolder.folder(safeName(a.topic || 'No Topic'));
        const aFolder = topicFolder.folder(safeName(`Assignment - ${a.title || 'untitled'}`));
        const txt = [
          `Title: ${a.title || ''}`,
          `Due: ${a.due || 'N/A'}`,
          `Link: ${a.url || ''}`,
          '',
          'Description:',
          (a.description || '').trim(),
          '',
          'Attachment Links:',
          ...(a.links || []).map(u => `- ${u}`)
        ].join('\n');
        aFolder.file('item.txt', txt);

        // Attachments for assignment
        if (a.links && a.links.length) {
          const attachFolder = aFolder.folder('Attachments');
          await downloadAllAttachments(
            a.links,
            attachFolder,
            `Downloading assignment attachments for "${course.title}"`,
            (cur, total, url) => {
              completedSteps++;
              setProgress(20 + 70 * (completedSteps / Math.max(1, totalSteps)));
            }
          );
        }
        completedSteps++;
        setProgress(20 + 70 * (completedSteps / Math.max(1, totalSteps)));
      }
    }

    done++;
    setStatus(`Zipping: ${course.title}`);
    setProgress(20 + 70 * (done / Math.max(1, courses.length)));
  }

  setStatus('Finalizing ZIP…');
  setProgress(98);

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);

  await chrome.downloads.download({
    url,
    filename: `${rootName}.zip`,
    saveAs: true
  });

  setProgress(100);
  setStatus('ZIP built — browser should start downloading.');
  startBtn.disabled = false;
}