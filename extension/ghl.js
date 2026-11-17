// Runs on GHL pages. Shows a "Call" button on contact pages.
(function () {
  var PHONE_PAGE = '6afc858278a09edbda179203'; // GHL custom page id of "Phone"
  var btn = null, note = null;

  function current() {
    var m = location.pathname.match(/\/v2\/location\/([^/]+)\/contacts\/detail\/([^/?#]+)/);
    return m ? { loc: m[1], id: m[2] } : null;
  }
  function toast(text) {
    if (!note) {
      note = document.createElement('div');
      note.style.cssText = 'position:fixed;right:24px;bottom:84px;z-index:2147483647;background:#111827;color:#fff;font:13px -apple-system,Segoe UI,Roboto,sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.2);max-width:280px';
      document.body.appendChild(note);
    }
    note.textContent = text; note.style.display = 'block';
    clearTimeout(note._t); note._t = setTimeout(function () { note.style.display = 'none'; }, 5000);
  }
  function make() {
    btn = document.createElement('button');
    btn.textContent = '📞 Call';
    btn.title = 'Call this contact with the Brandefyn Phone';
    btn.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483647;background:#16a34a;color:#fff;border:0;border-radius:999px;padding:12px 20px;font:600 15px -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer';
    btn.onclick = function () {
      var c = current(); if (!c) return;
      chrome.storage.local.get('bfnAlive', function (r) {
        var alive = r.bfnAlive && Date.now() - r.bfnAlive < 5000;
        chrome.storage.local.set({ bfnDial: { contactId: c.id, ts: Date.now(), claimed: '' } }, function () {
          if (alive) toast('Calling… answer happens in your Phone window.');
          else {
            window.open(location.origin + '/v2/location/' + c.loc + '/custom-page-link/' + PHONE_PAGE, 'brandefyn_phone_tab');
            toast('Opening the Phone… the call starts as soon as it is ready.');
          }
        });
      });
    };
    document.body.appendChild(btn);
  }
  setInterval(function () {
    var c = current();
    if (c && !btn) make();
    else if (!c && btn) { btn.remove(); btn = null; }
  }, 800);
})();
