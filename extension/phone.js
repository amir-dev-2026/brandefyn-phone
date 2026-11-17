// Runs inside the Brandefyn Phone page (in GHL or its pop-out window).
(function () {
  if (window.top === window && !window.opener) return; // only the real phone (inside GHL or its pop-out)
  var me = Math.random().toString(36).slice(2);
  function beat() { try { chrome.storage.local.set({ bfnAlive: Date.now() }); } catch (e) {} }
  beat(); setInterval(beat, 2000);
  function take(req) {
    if (!req || !(req.contactId || req.conversationId) || req.claimed || Date.now() - req.ts > 60000) return;
    chrome.storage.local.set({ bfnDial: { contactId: req.contactId, conversationId: req.conversationId, ts: req.ts, claimed: me } }, function () {
      setTimeout(function () {
        chrome.storage.local.get('bfnDial', function (r) {
          var d = r.bfnDial;
          if (d && d.claimed === me && d.ts === req.ts) {
            chrome.storage.local.remove('bfnDial');
            window.postMessage({ bfnDial: { contactId: d.contactId || '', conversationId: d.conversationId || '' } }, location.origin);
          }
        });
      }, 150);
    });
  }
  chrome.storage.onChanged.addListener(function (ch, area) {
    if (area === 'local' && ch.bfnDial && ch.bfnDial.newValue) take(ch.bfnDial.newValue);
  });
  // A call requested while the Phone was closed: pick it up once the page is ready.
  setTimeout(function () { chrome.storage.local.get('bfnDial', function (r) { take(r.bfnDial); }); }, 1500);
})();
