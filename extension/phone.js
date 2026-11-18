// Runs inside the Brandefyn Phone page (in GHL or its pop-out window).
(function () {
  if (window.top === window && !window.opener) return; // only the real phone (inside GHL or its pop-out)
  var me = Math.random().toString(36).slice(2);
  function beat() { try { chrome.storage.local.set({ bfnAlive: Date.now() }); } catch (e) {} }
  beat(); setInterval(beat, 2000);
  // Claim a request so only one open Phone handles it.
  function claim(key, req, done) {
    if (!req || req.claimed || Date.now() - req.ts > 60000) return;
    var mine = Object.assign({}, req, { claimed: me }), o = {}; o[key] = mine;
    chrome.storage.local.set(o, function () {
      setTimeout(function () {
        chrome.storage.local.get(key, function (r) {
          var d = r[key];
          if (d && d.claimed === me && d.ts === req.ts) { chrome.storage.local.remove(key); done(d); }
        });
      }, 150);
    });
  }
  function onDial(req) {
    if (!req || !(req.contactId || req.conversationId)) return;
    claim('bfnDial', req, function (d) {
      window.postMessage({ bfnDial: { contactId: d.contactId || '', conversationId: d.conversationId || '' } }, location.origin);
    });
  }
  function onText(req) {
    if (!req || !req.message) return;
    claim('bfnText', req, function (d) {
      window.postMessage({ bfnText: { reqId: d.reqId, contactId: d.contactId || '', conversationId: d.conversationId || '', message: d.message } }, location.origin);
    });
  }
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (e.source === window && d.bfnTextResult) chrome.storage.local.set({ bfnTextResult: Object.assign({ ts: Date.now() }, d.bfnTextResult) });
    if (e.source === window && d.bfnTemplates) chrome.storage.local.set({ bfnTemplates: d.bfnTemplates });
  });
  chrome.storage.onChanged.addListener(function (ch, area) {
    if (area !== 'local') return;
    if (ch.bfnDial && ch.bfnDial.newValue) onDial(ch.bfnDial.newValue);
    if (ch.bfnText && ch.bfnText.newValue) onText(ch.bfnText.newValue);
    if (ch.bfnOpenTpl && ch.bfnOpenTpl.newValue) window.postMessage({ bfnOpenTemplates: true }, location.origin);
  });
  setTimeout(function () { chrome.storage.local.get(['bfnDial', 'bfnText'], function (r) { onDial(r.bfnDial); onText(r.bfnText); }); }, 1500);
})();
