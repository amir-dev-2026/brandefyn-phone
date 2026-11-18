// Brandefyn panel on GHL contact pages and conversations: Call · Text · Voicemail · Recent.
// The Phone page (GHL left menu → Phone, or its pop-out window) does the audio; this panel controls it.
(function () {
  var PHONE_PAGE = '6afc858278a09edbda179203';
  var FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  var fab = null, panel = null, ctxKey = '', contact = null, tab = 'call', tpls = [], engines = {}, lastStatus = 'off';
  var dialedFor = '', showResult = false, recentCache = null;

  // ---------- helpers ----------
  function current() {
    var m = location.pathname.match(/\/v2\/location\/([^/]+)\/contacts\/detail\/([^/?#]+)/);
    if (m) return { loc: m[1], contactId: m[2], key: 'c:' + m[2] };
    m = location.pathname.match(/\/v2\/location\/([^/]+)\/conversations\/conversations\/([^/?#]+)/);
    if (m) return { loc: m[1], conversationId: m[2], key: 'v:' + m[2] };
    return null;
  }
  function el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
  function btn(label, bg, fg, extra) { var b = el('button', 'border:0;border-radius:10px;padding:10px 12px;font:600 14px ' + FONT + ';cursor:pointer;background:' + bg + ';color:' + (fg || '#fff') + ';' + (extra || ''), label); return b; }
  function rid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function engine() {
    var best = null;
    Object.keys(engines).forEach(function (k) {
      var s = engines[k]; if (!s || Date.now() - (s.ts || 0) > 5000) return;
      var rank = { incoming: 4, connected: 3, dialing: 3, idle: 2, off: 1 }[s.status] || 0;
      if (!best || rank > best._r) best = Object.assign({ _r: rank }, s);
    });
    return best;
  }
  function alive() { var e = engine(); return !!(e && e.status !== 'off'); }
  function openPhone() { var c = current(); if (c) window.open(location.origin + '/v2/location/' + c.loc + '/custom-page-link/' + PHONE_PAGE, 'brandefyn_phone_tab'); }
  function wait(key, id, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { chrome.storage.onChanged.removeListener(fn); reject(new Error('The Phone did not answer. Is it open and signed in?')); }, ms || 25000);
      function fn(ch, area) {
        if (area !== 'local' || !ch[key] || !ch[key].newValue || ch[key].newValue.id !== id) return;
        clearTimeout(t); chrome.storage.onChanged.removeListener(fn); resolve(ch[key].newValue);
      }
      chrome.storage.onChanged.addListener(fn);
    });
  }
  function rpc(path, body, ms) {
    if (!alive()) return Promise.reject(new Error('The Phone is off. Open it first.'));
    var id = rid();
    var p = wait('bfnRes', id, ms);
    chrome.storage.local.set({ bfnReq: { id: id, path: path, body: body || {}, ts: Date.now(), claimed: '' } });
    return p.then(function (r) { if (!r.ok) throw new Error(r.error || 'Failed'); return r.data; });
  }
  function cmd(name, args) {
    if (!alive()) return Promise.reject(new Error('The Phone is off. Open it first.'));
    var id = rid();
    var p = wait('bfnCmdRes', id, 30000);
    chrome.storage.local.set({ bfnCmd: { id: id, cmd: name, args: args || {}, ts: Date.now(), claimed: '' } });
    return p.then(function (r) { return r.res || { ok: true }; });
  }
  function fill(text) {
    var first = contact && contact.first || 'there', mine = ((engine() || {}).me || '').split(/\s+/)[0] || '';
    return String(text || '').replace(/\{\{\s*first_name\s*\}\}/g, first).replace(/\{\{\s*my_name\s*\}\}/g, mine);
  }
  function fmtTime(at) { var d = new Date(at); if (isNaN(d)) return ''; return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function flash(box, text, bad) {
    var n = el('div', 'margin-top:8px;padding:8px 10px;border-radius:8px;font-size:13px;background:' + (bad ? '#fee2e2;color:#991b1b' : '#dcfce7;color:#166534'), text);
    box.appendChild(n); setTimeout(function () { n.remove(); }, 6000);
  }

  // ---------- panel shell ----------
  function makeFab() {
    fab = btn('📞 Brandefyn', '#111827', '#fff', 'position:fixed;right:24px;bottom:24px;z-index:2147483646;border-radius:999px;padding:12px 18px;box-shadow:0 6px 18px rgba(0,0,0,.25)');
    fab.title = 'Call, text or leave a voicemail';
    fab.onclick = function () { panel ? closePanel() : openPanel(); };
    document.body.appendChild(fab);
  }
  function closePanel() { if (panel) panel.remove(); panel = null; }
  function openPanel() {
    panel = el('div', 'position:fixed;right:16px;top:72px;bottom:84px;width:380px;z-index:2147483647;background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.22);display:flex;flex-direction:column;font:14px ' + FONT + ';color:#111827;overflow:hidden');
    panel.innerHTML =
      '<div style="padding:14px 16px 10px;border-bottom:1px solid #f1f5f9">' +
        '<div style="display:flex;align-items:center;gap:8px"><div class="bp-name" style="flex:1;font-weight:700;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Loading…</div><button class="bp-x" style="border:0;background:none;font-size:18px;cursor:pointer;color:#6b7280">✕</button></div>' +
        '<div class="bp-sub" style="color:#6b7280;font-size:13px;margin-top:2px"></div>' +
        '<div class="bp-eng" style="margin-top:8px;font-size:12px"></div>' +
      '</div>' +
      '<div class="bp-tabs" style="display:flex;gap:4px;padding:8px 10px;border-bottom:1px solid #f1f5f9"></div>' +
      '<div class="bp-body" style="flex:1;overflow:auto;padding:14px 16px"></div>' +
      '<div style="padding:8px 16px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;font-size:12px"><a href="#" class="bp-tpl" style="color:#2563eb">✏️ Edit templates</a><a href="#" class="bp-dial" style="color:#2563eb">⚡ Power dialer</a><a href="#" class="bp-open" style="color:#2563eb">Open Phone window</a></div>';
    document.body.appendChild(panel);
    panel.querySelector('.bp-x').onclick = closePanel;
    panel.querySelector('.bp-open').onclick = function (e) { e.preventDefault(); openPhone(); };
    panel.querySelector('.bp-dial').onclick = function (e) { e.preventDefault(); cmd('dialer').catch(function () { openPhone(); }); };
    panel.querySelector('.bp-tpl').onclick = function (e) { e.preventDefault(); cmd('templates').catch(function () { openPhone(); }); };
    var tabs = panel.querySelector('.bp-tabs');
    [['call', '📞 Call'], ['text', '💬 Text'], ['vm', '📩 Voicemail'], ['recent', '🕘 Recent']].forEach(function (t) {
      var b = el('button', 'flex:1;border:0;border-radius:8px;padding:8px 4px;font:600 13px ' + FONT + ';cursor:pointer', t[1]);
      b.dataset.tab = t[0]; b.onclick = function () { tab = t[0]; renderTabs(); renderBody(); };
      tabs.appendChild(b);
    });
    renderTabs(); renderEngine(); loadContact(); renderBody();
  }
  function renderTabs() {
    if (!panel) return;
    panel.querySelectorAll('.bp-tabs button').forEach(function (b) {
      var on = b.dataset.tab === tab; b.style.background = on ? '#2563eb' : '#f3f4f6'; b.style.color = on ? '#fff' : '#374151';
    });
  }
  function renderEngine() {
    if (!panel) return;
    var box = panel.querySelector('.bp-eng'), e = engine(); box.innerHTML = '';
    if (!e) {
      box.appendChild(el('span', 'color:#b91c1c', '○ Phone is off  '));
      var a = el('a', 'color:#2563eb;cursor:pointer;font-weight:600', 'Open phone'); a.onclick = openPhone; box.appendChild(a);
    } else if (e.status === 'off') {
      box.appendChild(el('span', 'color:#b45309', '○ Phone is open but not turned on  '));
      var b = el('a', 'color:#2563eb;cursor:pointer;font-weight:600', 'Turn on'); b.onclick = function () { cmd('start').catch(function () {}); }; box.appendChild(b);
    } else {
      box.appendChild(el('span', 'color:#15803d', '● Phone ready' + (e.me ? ' · ' + e.me : '')));
    }
  }
  function loadContact() {
    var c = current(); if (!c || !panel) return;
    if (contact && contact._key === c.key) { renderHeader(); return; }
    contact = null; recentCache = null; renderHeader();
    if (!alive()) return;
    rpc('bfn-phone-lookup', c.contactId ? { contactId: c.contactId } : { conversationId: c.conversationId }).then(function (j) {
      var x = (j.contacts || [])[0];
      if (!x) throw new Error('Contact not found');
      contact = { _key: c.key, id: x.id, name: x.name || x.phone || 'Unknown', first: String(x.name || '').trim().split(/\s+/)[0], phone: x.phone || '', company: x.company || '' };
      renderHeader(); renderBody();
    }).catch(function (err) { if (panel) panel.querySelector('.bp-sub').textContent = err.message; });
    if (!tpls.length) rpc('bfn-phone-templates', { act: 'list' }).then(function (j) { tpls = j.templates || []; renderBody(); }).catch(function () {});
  }
  function renderHeader() {
    if (!panel) return;
    panel.querySelector('.bp-name').textContent = contact ? contact.name : (alive() ? 'Loading…' : 'Contact');
    panel.querySelector('.bp-sub').textContent = contact ? [contact.phone || 'No phone number', contact.company].filter(Boolean).join(' · ') : (alive() ? '' : 'Open the Phone to call, text or leave voicemails.');
  }

  // ---------- tabs ----------
  function renderBody() {
    if (!panel) return;
    var body = panel.querySelector('.bp-body'); body.innerHTML = '';
    if (!alive()) {
      body.appendChild(el('div', 'color:#6b7280;line-height:1.5', 'The Phone does the calling and texting. Open it (GHL left menu → Phone, or the pop-out window) and keep it open.'));
      var o = btn('Open Phone', '#2563eb', '#fff', 'width:100%;margin-top:12px'); o.onclick = openPhone; body.appendChild(o);
      return;
    }
    if (!contact) { body.appendChild(el('div', 'color:#6b7280', 'Loading contact…')); return; }
    if (tab === 'call') renderCall(body);
    else if (tab === 'text') renderText(body);
    else if (tab === 'vm') renderVm(body);
    else renderRecent(body);
  }
  function vmTpls() { return tpls.filter(function (t) { return t.kind === 'vm' && (t.voice !== 'rec' || t.rec); }); }

  var timerInt = null;
  function renderCall(body) {
    var e = engine() || {};
    clearInterval(timerInt);
    if (e.status === 'incoming') {
      var inc = el('div', 'background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:12px;text-align:center;margin-bottom:12px');
      inc.appendChild(el('div', 'font-size:12px;color:#047857', 'Incoming call'));
      inc.appendChild(el('div', 'font-weight:700;font-size:16px;margin:4px 0 10px', e.incoming || ''));
      var row = el('div', 'display:flex;gap:8px'), a = btn('Answer', '#16a34a', '#fff', 'flex:1'), d = btn('Decline', '#dc2626', '#fff', 'flex:1');
      a.onclick = function () { cmd('answer'); }; d.onclick = function () { cmd('decline'); };
      row.appendChild(a); row.appendChild(d); inc.appendChild(row); body.appendChild(inc);
    }
    if (e.status === 'dialing' || e.status === 'connected') {
      var box = el('div', 'border:1px solid #e5e7eb;border-radius:12px;padding:12px');
      box.appendChild(el('div', 'font-weight:700', (e.name || e.to || 'On a call')));
      var tm = el('div', 'color:#6b7280;font-size:13px;margin:2px 0 10px;font-variant-numeric:tabular-nums', e.status === 'dialing' ? 'Calling…' : 'Connected');
      box.appendChild(tm);
      if (e.startedAt) timerInt = setInterval(function () { var s = Math.floor((Date.now() - e.startedAt) / 1000); tm.textContent = 'Connected · ' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }, 500);
      var r1 = el('div', 'display:flex;gap:8px');
      var mu = btn(e.muted ? 'Unmute' : 'Mute', '#6b7280', '#fff', 'flex:1'), kp = btn('Keypad', '#e5e7eb', '#111827', 'flex:1'), hu = btn('Hang up', '#dc2626', '#fff', 'flex:1');
      mu.onclick = function () { cmd('mute'); }; hu.onclick = function () { cmd('hangup'); };
      r1.appendChild(mu); r1.appendChild(kp); r1.appendChild(hu); box.appendChild(r1);
      var pad = el('div', 'display:none;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px');
      '123456789*0#'.split('').forEach(function (k) { var b = btn(k, '#f3f4f6', '#111827', 'padding:8px'); b.onclick = function () { cmd('digits', { d: k }); }; pad.appendChild(b); });
      kp.onclick = function () { pad.style.display = pad.style.display === 'none' ? 'grid' : 'none'; };
      box.appendChild(pad);
      if (e.outgoing && vmTpls().length) {
        box.appendChild(el('div', 'font-size:12px;color:#6b7280;margin:12px 0 6px', 'Reached voicemail? Click as soon as the greeting starts (the message takes a few seconds to prepare):'));
        vmTpls().forEach(function (t) {
          var b = btn('📩 ' + t.name, '#7c3aed', '#fff', 'width:100%;margin-bottom:6px;text-align:left');
          b.onclick = function () {
            var go = function (allow) {
              b.disabled = true; b.textContent = 'Dropping…';
              cmd('drop', { tid: t.id, contactId: contact.id, allow: allow }).then(function (r) {
                if (r && r.ok === false) {
                  b.disabled = false; b.textContent = '📩 ' + t.name;
                  if (!allow && String(r.error || '').indexOf('NOT_ENGAGED') === 0) {
                    if (confirm((contact.first || 'This contact') + ' has no reply on record.\n\nDid they reply to us or ask us to call? Press OK to allow voicemails for them and drop it now.')) go(true);
                  } else flash(box, r.error || 'Drop failed', true);
                }
              });
            };
            go(false);
          };
          box.appendChild(b);
        });
      }
      body.appendChild(box);
      return;
    }
    // idle
    var card = el('div', 'text-align:center;padding:6px 0 4px');
    card.appendChild(el('div', 'font-size:22px;font-weight:700;letter-spacing:.5px', contact.phone || 'No phone number'));
    var call = btn('📞 Call ' + (contact.first || ''), '#16a34a', '#fff', 'width:100%;margin-top:12px;padding:14px;font-size:16px');
    call.disabled = !contact.phone || e.status !== 'idle';
    if (call.disabled) call.style.opacity = '.5';
    call.onclick = function () { dialedFor = contact.id; showResult = false; cmd('call', { to: contact.phone, name: contact.name }); };
    card.appendChild(call);
    var lr = el('a', 'display:inline-block;margin-top:10px;font-size:12px;color:#2563eb;cursor:pointer', showResult ? '' : 'Log a call result');
    lr.onclick = function () { showResult = true; renderBody(); };
    card.appendChild(lr);
    body.appendChild(card);
    if (showResult) renderResult(body);
  }
  function renderResult(body) {
    var box = el('div', 'margin-top:14px;border:1px solid #c7d2fe;background:#f8faff;border-radius:12px;padding:12px');
    box.appendChild(el('div', 'font-weight:700;margin-bottom:8px', 'How did the call go?'));
    var grid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:6px'), chosen = '';
    var opts = [['interested', '✅ Interested'], ['callback', '🔁 Call back'], ['noanswer', '📵 No answer'], ['notinterested', '⛔ Not interested']];
    var cb = el('div', 'display:none;margin-top:8px');
    cb.appendChild(el('div', 'font-size:12px;color:#6b7280;margin-bottom:3px', 'Call back on (your time)'));
    var dt = el('input', 'width:100%;box-sizing:border-box;padding:7px;border:1px solid #d1d5db;border-radius:8px'); dt.type = 'datetime-local';
    var tm = new Date(Date.now() + 24 * 3600 * 1000); tm.setHours(10, 0, 0, 0);
    dt.value = new Date(tm.getTime() - tm.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    cb.appendChild(dt);
    opts.forEach(function (o) {
      var b = btn(o[1], '#fff', '#111827', 'border:1px solid #d1d5db;padding:8px;font-size:13px');
      b.onclick = function () {
        chosen = o[0];
        grid.querySelectorAll('button').forEach(function (x) { x.style.background = '#fff'; x.style.borderColor = '#d1d5db'; });
        b.style.background = '#dbeafe'; b.style.borderColor = '#2563eb';
        cb.style.display = chosen === 'callback' ? 'block' : 'none';
      };
      grid.appendChild(b);
    });
    box.appendChild(grid); box.appendChild(cb);
    var note = el('textarea', 'width:100%;box-sizing:border-box;margin-top:8px;border:1px solid #d1d5db;border-radius:8px;padding:8px;font:13px ' + FONT + ';min-height:60px');
    note.placeholder = 'Quick note (optional)'; box.appendChild(note);
    var row = el('div', 'display:flex;gap:8px;margin-top:8px'), save = btn('Save result', '#2563eb', '#fff', 'flex:1'), skip = btn('Skip', '#f3f4f6', '#374151');
    skip.onclick = function () { showResult = false; renderBody(); };
    save.onclick = function () {
      if (!chosen) { flash(box, 'Pick a result first', true); return; }
      save.disabled = true; save.textContent = 'Saving…';
      rpc('bfn-phone-result', { contactId: contact.id, result: chosen, note: note.value, callbackAt: chosen === 'callback' ? new Date(dt.value).toISOString() : '', name: contact.name })
        .then(function () { showResult = false; recentCache = null; renderBody(); var b2 = panel && panel.querySelector('.bp-body'); if (b2) flash(b2, 'Saved ✓ Tag + note added' + (chosen === 'callback' ? ' + call-back task' : '')); })
        .catch(function (err) { save.disabled = false; save.textContent = 'Save result'; flash(box, err.message, true); });
    };
    row.appendChild(save); row.appendChild(skip); box.appendChild(row);
    body.appendChild(box);
  }
  function renderText(body) {
    var texts = tpls.filter(function (t) { return t.kind === 'text'; });
    var sel = el('select', 'width:100%;padding:9px;border:1px solid #d1d5db;border-radius:10px;font:14px ' + FONT);
    sel.appendChild(new Option('✍️ Write my own message', ''));
    texts.forEach(function (t) { sel.appendChild(new Option(t.name, t.id)); });
    var ta = el('textarea', 'width:100%;box-sizing:border-box;margin-top:8px;border:1px solid #d1d5db;border-radius:10px;padding:10px;font:14px ' + FONT + ';min-height:110px');
    ta.placeholder = 'Type your message…';
    var prev = el('div', 'margin-top:8px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;padding:8px 10px;font-size:13px;color:#334155;white-space:pre-wrap;display:none');
    var cnt = el('div', 'font-size:12px;color:#6b7280;margin-top:6px');
    function upd() {
      var f = fill(ta.value), n = f.length;
      cnt.textContent = n + ' characters' + (n > 160 ? ' · ' + Math.ceil(n / 153) + ' texts' : '') + (contact.phone ? ' · to ' + contact.phone : ' · no phone number');
      prev.style.display = /\{\{/.test(ta.value) ? 'block' : 'none'; prev.textContent = 'They will see: ' + f;
    }
    sel.onchange = function () { var t = texts.find(function (x) { return x.id === sel.value; }); ta.value = t ? t.body : ''; upd(); ta.focus(); };
    ta.oninput = upd;
    var send = btn('Send text', '#2563eb', '#fff', 'width:100%;margin-top:10px;padding:12px');
    send.onclick = function () {
      var msg = ta.value.trim(); if (!msg) return;
      send.disabled = true; send.textContent = 'Sending…';
      rpc('bfn-phone-sms', { contactId: contact.id, message: msg }).then(function (j) {
        send.disabled = false; send.textContent = 'Send text';
        if (j.ok) { ta.value = ''; sel.value = ''; upd(); recentCache = null; flash(body, 'Text sent ✓'); } else flash(body, 'Not sent: ' + (j.error || 'unknown error'), true);
      }).catch(function (err) { send.disabled = false; send.textContent = 'Send text'; flash(body, err.message, true); });
    };
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send.click(); });
    body.appendChild(sel); body.appendChild(ta); body.appendChild(prev); body.appendChild(cnt); body.appendChild(send);
    body.appendChild(el('div', 'font-size:11px;color:#6b7280;margin-top:8px', '{{first_name}} and {{my_name}} fill in automatically. Replies show in the GHL conversation.'));
    upd();
  }
  function renderVm(body) {
    var e = engine() || {};
    if (e.status === 'dialing' || e.status === 'connected') {
      body.appendChild(el('div', 'background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:10px;font-size:13px;margin-bottom:12px', 'You are on a call. To leave a voicemail on this call, use the 📩 drop buttons in the Call tab after the beep.'));
    }
    var list = vmTpls();
    body.appendChild(el('div', 'font-weight:700;margin-bottom:4px', 'Send a voicemail without talking'));
    body.appendChild(el('div', 'font-size:12px;color:#6b7280;margin-bottom:10px;line-height:1.5', 'We call ' + (contact.first || 'them') + ', wait for the voicemail beep and leave the message. If they pick up, they are connected to the team (owner first).'));
    var sel = el('select', 'width:100%;padding:9px;border:1px solid #d1d5db;border-radius:10px;font:14px ' + FONT);
    sel.appendChild(new Option('✍️ Write my own script (Clara reads it)', '__own'));
    list.forEach(function (t) { sel.appendChild(new Option((t.voice === 'rec' ? '🎙 ' : t.voice === 'script' ? '📜 ' : '🗣 ') + t.name, t.id)); });
    if (list.length) sel.value = list[0].id;
    var own = el('textarea', 'display:none;width:100%;margin-top:8px;min-height:90px;border:1px solid #d1d5db;border-radius:10px;padding:8px;font:13px ' + FONT + ';box-sizing:border-box');
    own.placeholder = 'Hey {{first_name}}, it\'s Clara from Brandefyn. Thanks for getting back to me, um, give me a quick call back at two-six-oh, three-seven-six, four-oh-three-one. Talk soon.';
    var cnt = el('div', 'display:none;font-size:11px;color:#6b7280;text-align:right', '');
    var prev = el('div', 'margin-top:8px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;padding:8px 10px;font-size:13px;color:#334155;white-space:pre-wrap');
    var player = el('div', 'margin-top:8px');
    var okBox = el('label', 'display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:12px;color:#334155;cursor:pointer;line-height:1.4;padding:6px;border-radius:8px');
    var ok = document.createElement('input'); ok.type = 'checkbox'; ok.style.marginTop = '2px';
    okBox.appendChild(ok); okBox.appendChild(el('span', '', '✅ ' + (contact.first || 'They') + ' replied to us or asked us to call (email, LinkedIn, phone…). Allow voicemails for this contact.'));
    var ready = { aid: '', key: '' };
    var row = el('div', 'display:flex;gap:8px;margin-top:10px');
    var pv = btn('▶ Preview', '#ede9fe', '#5b21b6', 'flex:1');
    var go = btn('📩 Send voicemail now', '#7c3aed', '#fff', 'flex:2');
    function cur() { return sel.value === '__own' ? { id: '__own', voice: 'script' } : (list.find(function (x) { return x.id === sel.value; }) || { id: '__own', voice: 'script' }); }
    function req() { var t = cur(); var r = { contactId: contact.id, firstName: contact.first, allow: ok.checked }; if (t.id === '__own') r.script = own.value.trim(); else r.templateId = t.id; return r; }
    function key() { var r = req(); return (r.templateId || '') + '|' + (r.script || ''); }
    function needOk(msg) {
      if (String(msg || '').indexOf('NOT_ENGAGED') !== 0) return false;
      okBox.style.background = '#fef3c7';
      flash(body, 'No reply on record for ' + (contact.first || 'this contact') + '. If they replied or asked you to call, tick the ✅ box and try again.', true);
      return true;
    }
    function upd() {
      var t = cur(); player.innerHTML = ''; ready = { aid: '', key: '' }; pv.textContent = '▶ Preview';
      var isOwn = t.id === '__own'; own.style.display = isOwn ? 'block' : 'none'; cnt.style.display = isOwn ? 'block' : 'none';
      prev.style.display = isOwn ? 'none' : '';
      prev.textContent = t.voice === 'rec' ? '🎙 Your recorded message (' + (t.recSecs || '?') + 's)' : t.voice === 'script' ? '📜 Clara reads these exact words: ' + t.body : '🗣 A fresh, natural script is written for ' + (contact.first || 'this contact') + ' about: ' + t.body;
      pv.style.display = t.voice === 'rec' ? 'none' : '';
    }
    own.oninput = function () { ready = { aid: '', key: '' }; player.innerHTML = ''; cnt.textContent = own.value.length + ' / 900 · use {{first_name}} for their name · keep it under ~60 words'; };
    ok.onchange = function () { okBox.style.background = ''; };
    pv.onclick = function () {
      var r = req(); if (sel.value === '__own' && !r.script) { flash(body, 'Write the script first', true); return; }
      pv.disabled = true; pv.textContent = sel.value === '__own' ? 'Recording Clara…' : 'Writing…';
      rpc('bfn-phone-vmprep', r, 60000).then(function (j) {
        pv.disabled = false; pv.textContent = '▶ Preview again';
        if (!j.ok || !j.aid) { if (!needOk(j.error)) flash(body, j.error || 'Could not prepare audio', true); return; }
        ready = { aid: j.aid, key: key() };
        if (sel.value !== '__own') { prev.style.display = ''; prev.textContent = String(j.script || '').replace(/\[[^\]]*\]\s*/g, ''); }
        player.innerHTML = ''; var au = document.createElement('audio'); au.controls = true; au.style.width = '100%';
        player.appendChild(el('div', 'font-size:12px;color:#6b7280', '🔊 Loading audio…'));
        var url = 'https://n8n.brandefyn.com/webhook/bfn-vm-audio?id=' + encodeURIComponent(j.aid);
        var tries = 0;
        (function load() {
          fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }).then(function (bl) {
            if (bl.size < 1000) throw new Error('not ready');
            player.innerHTML = ''; au.src = URL.createObjectURL(new Blob([bl], { type: 'audio/mpeg' })); player.appendChild(au); au.play().catch(function () {});
          }).catch(function (err) {
            if (++tries < 4) return setTimeout(load, 1500);
            player.innerHTML = ''; player.appendChild(el('div', 'font-size:12px;color:#b91c1c', 'Could not load the audio (' + err.message + '). Press Preview again.'));
          });
        })();
      }).catch(function (err) { pv.disabled = false; pv.textContent = '▶ Preview'; flash(body, err.message, true); });
    };
    sel.onchange = upd;
    go.disabled = !contact.phone;
    go.onclick = function () {
      var r = req(); if (sel.value === '__own' && !r.script) { flash(body, 'Write the script first', true); return; }
      if (!confirm('Call ' + (contact.name || contact.phone) + ' and leave this voicemail?')) return;
      go.disabled = true; go.textContent = 'Preparing…';
      r.aid = ready.key === key() ? ready.aid : '';
      rpc('bfn-phone-vmsend', r, 60000).then(function (j) {
        go.disabled = false; go.textContent = '📩 Send voicemail now';
        if (j.ok) flash(body, 'Calling now ✓ The voicemail will be left after the beep. A note with the script is added when done.');
        else if (!needOk(j.error)) flash(body, j.error || 'Could not send', true);
      }).catch(function (err) { go.disabled = false; go.textContent = '📩 Send voicemail now'; flash(body, err.message, true); });
    };
    row.appendChild(pv); row.appendChild(go);
    body.appendChild(sel); body.appendChild(own); body.appendChild(cnt); body.appendChild(prev); body.appendChild(player); body.appendChild(okBox); body.appendChild(row); upd();
    body.appendChild(el('div', 'font-size:11px;color:#6b7280;margin-top:8px', 'Preview lets you hear it first. 🗣 = Clara writes a fresh script · 📜 / ✍️ = Clara reads your exact words · 🎙 = your own recorded voice.'));
  }
  function renderRecent(body) {
    var top = el('div', 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px');
    top.appendChild(el('b', '', 'Latest activity'));
    var rf = el('a', 'font-size:12px;color:#2563eb;cursor:pointer', 'Refresh'); rf.onclick = function () { recentCache = null; renderBody(); };
    top.appendChild(rf); body.appendChild(top);
    var list = el('div', ''); body.appendChild(list);
    function show(items) {
      list.innerHTML = '';
      if (!items.length) { list.appendChild(el('div', 'color:#6b7280', 'Nothing yet.')); return; }
      var icon = { call: '📞', sms: '💬', note: '📝', email: '✉️' };
      items.forEach(function (it) {
        var row = el('div', 'border-bottom:1px solid #f1f5f9;padding:8px 0');
        var h = el('div', 'font-size:12px;color:#6b7280', (icon[it.kind] || '•') + ' ' + (it.dir === 'inbound' ? 'In · ' : it.dir === 'outbound' ? 'Out · ' : '') + fmtTime(it.at));
        var t = el('div', 'font-size:13px;white-space:pre-wrap;margin-top:2px;max-height:120px;overflow:auto', it.text || '');
        row.appendChild(h); row.appendChild(t); list.appendChild(row);
      });
    }
    if (recentCache && recentCache.key === contact.id) { show(recentCache.items); return; }
    list.appendChild(el('div', 'color:#6b7280', 'Loading…'));
    rpc('bfn-phone-recent', { contactId: contact.id }).then(function (j) { recentCache = { key: contact.id, items: j.items || [] }; if (tab === 'recent') show(recentCache.items); })
      .catch(function (err) { list.innerHTML = ''; list.appendChild(el('div', 'color:#b91c1c', err.message)); });
  }

  // ---------- live state ----------
  function onEngineChange() {
    var e = engine(), st = e ? e.status : 'off';
    renderEngine();
    if (st !== lastStatus) {
      if ((lastStatus === 'connected' || lastStatus === 'dialing') && st === 'idle' && contact && dialedFor === contact.id) { showResult = true; tab = 'call'; renderTabs(); }
      if (lastStatus === 'off' && st !== 'off' && panel) { loadContact(); }
      lastStatus = st;
      if (panel && (tab === 'call' || tab === 'vm' || !contact)) renderBody();
      else if (panel && st !== 'off' && !contact) renderBody();
    } else if (panel && tab === 'call' && e && (e.status === 'connected' || e.status === 'dialing')) {
      var key = e.status + e.muted + e.startedAt;
      if (key !== onEngineChange._k) { onEngineChange._k = key; renderBody(); }
    }
  }
  chrome.storage.local.get(null, function (all) {
    Object.keys(all || {}).forEach(function (k) { if (k.indexOf('bfnState_') === 0) engines[k] = all[k]; });
    if (all && all.bfnTemplates && !tpls.length) tpls = [];
  });
  chrome.storage.onChanged.addListener(function (ch, area) {
    if (area !== 'local') return;
    var hit = false;
    Object.keys(ch).forEach(function (k) {
      if (k.indexOf('bfnState_') === 0) { hit = true; if (ch[k].newValue) engines[k] = ch[k].newValue; else delete engines[k]; }
    });
    if (hit) { onEngineChange(); followDialer(); }
  });
  setInterval(onEngineChange, 3000); // notice phones that went away

  // ---------- power dialer: show the contact being dialed in this GHL tab ----------
  var followed = '';
  function followDialer() {
    if (document.visibilityState !== 'visible') return;
    var lm = location.pathname.match(/\/v2\/location\/([^/]+)/); if (!lm || location.pathname.indexOf('/custom-page-link/') >= 0) return; var c = { loc: lm[1] };
    Object.keys(engines).forEach(function (k) {
      var d = engines[k] && engines[k].dialer; if (!d || !d.contactId || d.contactId === followed) return;
      followed = d.contactId;
      if (location.pathname.indexOf(d.contactId) < 0) location.href = location.origin + '/v2/location/' + c.loc + '/contacts/detail/' + d.contactId;
    });
  }

  // ---------- page watcher ----------
  setInterval(function () {
    var c = current();
    if (c && !fab) makeFab();
    else if (!c && fab) { fab.remove(); fab = null; closePanel(); }
    if (fab) fab.style.bottom = c && c.conversationId ? '96px' : '24px';
    if (panel) panel.style.bottom = c && c.conversationId ? '150px' : '84px';
    if (c && c.key !== ctxKey) { ctxKey = c.key; showResult = false; if (panel) { loadContact(); renderBody(); } }
  }, 800);
})();
