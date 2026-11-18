// Runs on GHL pages. Shows a Call / Text bar on contact pages and conversations.
(function () {
  var PHONE_PAGE = '6afc858278a09edbda179203'; // GHL custom page id of "Phone"
  var bar = null, note = null, box = null, pendingReq = '';
  var FONT = '-apple-system,Segoe UI,Roboto,sans-serif';

  function current() {
    var m = location.pathname.match(/\/v2\/location\/([^/]+)\/contacts\/detail\/([^/?#]+)/);
    if (m) return { loc: m[1], contactId: m[2] };
    m = location.pathname.match(/\/v2\/location\/([^/]+)\/conversations\/conversations\/([^/?#]+)/);
    if (m) return { loc: m[1], conversationId: m[2] };
    return null;
  }
  function toast(text, bad) {
    if (!note) {
      note = document.createElement('div');
      note.style.cssText = 'position:fixed;right:24px;z-index:2147483647;color:#fff;font:13px ' + FONT + ';padding:10px 14px;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.2);max-width:300px';
      document.body.appendChild(note);
    }
    note.style.background = bad ? '#b91c1c' : '#111827';
    note.style.bottom = (parseInt(bar ? bar.style.bottom : '24', 10) + 60) + 'px';
    note.textContent = text; note.style.display = 'block';
    clearTimeout(note._t); note._t = setTimeout(function () { note.style.display = 'none'; }, 6000);
  }
  function alive(cb) { chrome.storage.local.get('bfnAlive', function (r) { cb(r.bfnAlive && Date.now() - r.bfnAlive < 5000); }); }
  function openPhone(c) { window.open(location.origin + '/v2/location/' + c.loc + '/custom-page-link/' + PHONE_PAGE, 'brandefyn_phone_tab'); }
  function btn(label, bg) {
    var b = document.createElement('button'); b.textContent = label;
    b.style.cssText = 'background:' + bg + ';color:#fff;border:0;border-radius:999px;padding:11px 18px;font:600 14px ' + FONT + ';box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer';
    return b;
  }
  function call() {
    var c = current(); if (!c) return;
    alive(function (on) {
      chrome.storage.local.set({ bfnDial: { contactId: c.contactId || '', conversationId: c.conversationId || '', ts: Date.now(), claimed: '' } }, function () {
        if (on) toast('Calling… talk in your Phone window.');
        else { openPhone(c); toast('Opening the Phone… the call starts as soon as it is ready.'); }
      });
    });
  }
  function textBox() {
    if (box) { box.remove(); box = null; return; }
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;right:24px;z-index:2147483647;width:320px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.2);padding:12px;font:13px ' + FONT;
    box.style.bottom = (parseInt(bar.style.bottom, 10) + 58) + 'px';
    box.innerHTML = '<div style="font-weight:600;margin-bottom:6px">💬 Text this contact</div>' +
      '<textarea rows="4" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:8px;padding:8px;font:14px ' + FONT + ';resize:vertical" placeholder="Type a short message…"></textarea>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:8px"><span class="cnt" style="flex:1;color:#6b7280;font-size:12px">0 / 160</span>' +
      '<button class="x" style="border:0;background:#f3f4f6;border-radius:8px;padding:8px 12px;cursor:pointer">Cancel</button>' +
      '<button class="s" style="border:0;background:#2563eb;color:#fff;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer">Send</button></div>';
    document.body.appendChild(box);
    var ta = box.querySelector('textarea'), cnt = box.querySelector('.cnt'), send = box.querySelector('.s');
    ta.focus();
    ta.addEventListener('input', function () {
      var n = ta.value.length; cnt.textContent = n + ' / 160' + (n > 160 ? ' · ' + Math.ceil(n / 153) + ' texts' : '');
    });
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send.click(); });
    box.querySelector('.x').onclick = function () { box.remove(); box = null; };
    send.onclick = function () {
      var c = current(), msg = ta.value.trim();
      if (!c || !msg) return;
      alive(function (on) {
        if (!on) { toast('Open the Phone (GHL left menu) first, then press Send again.', true); openPhone(c); return; }
        pendingReq = Math.random().toString(36).slice(2);
        send.disabled = true; send.textContent = 'Sending…';
        chrome.storage.local.set({ bfnText: { reqId: pendingReq, contactId: c.contactId || '', conversationId: c.conversationId || '', message: msg, ts: Date.now(), claimed: '' } });
        setTimeout(function () {
          if (box && send.disabled) { send.disabled = false; send.textContent = 'Send'; toast('No answer from the Phone page. Check it is open and signed in.', true); }
        }, 20000);
      });
    };
  }
  chrome.storage.onChanged.addListener(function (ch, area) {
    if (area !== 'local' || !ch.bfnTextResult || !ch.bfnTextResult.newValue) return;
    var r = ch.bfnTextResult.newValue; if (r.reqId !== pendingReq) return;
    pendingReq = '';
    if (r.ok) { toast('Text sent ✓ It will show in the conversation.'); if (box) { box.remove(); box = null; } }
    else {
      toast('Not sent: ' + (r.error || 'unknown error'), true);
      if (box) { var s = box.querySelector('.s'); s.disabled = false; s.textContent = 'Send'; }
    }
  });
  function make() {
    bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483647;display:flex;gap:8px';
    var t = btn('💬 Text', '#2563eb'); t.title = 'Send a text from the Brandefyn number'; t.onclick = textBox;
    var c = btn('📞 Call', '#16a34a'); c.title = 'Call with the Brandefyn Phone'; c.onclick = call;
    bar.appendChild(t); bar.appendChild(c);
    document.body.appendChild(bar);
  }
  setInterval(function () {
    var c = current();
    if (c && !bar) make();
    else if (!c && bar) { bar.remove(); bar = null; if (box) { box.remove(); box = null; } }
    if (bar) bar.style.bottom = c && c.conversationId ? '96px' : '24px';
  }, 800);
})();
