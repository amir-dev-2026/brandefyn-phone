// Runs inside the Brandefyn Phone page (in GHL or its pop-out window).
// Relays the GHL panel's requests/commands to the page and publishes live call state.
(function () {
  if (window.top === window && !window.opener) return; // only the real phone (inside GHL or its pop-out)
  var me = Math.random().toString(36).slice(2), inCall = false, lastSaved = 0, lastState = null;
  var CALL_CMDS = { hangup: 1, mute: 1, digits: 1, drop: 1, answer: 1, decline: 1 };
  function save(o) { try { chrome.storage.local.set(o); } catch (e) {} }

  // Drop stale state from closed phones.
  chrome.storage.local.get(null, function (all) {
    var old = Object.keys(all || {}).filter(function (k) { return k.indexOf('bfnState_') === 0 && (!all[k] || Date.now() - (all[k].ts || 0) > 60000); });
    if (old.length) chrome.storage.local.remove(old);
  });
  window.addEventListener('pagehide', function () { try { chrome.storage.local.remove('bfnState_' + me); } catch (e) {} });

  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    var d = e.data || {};
    if (d.bfnState) {
      lastState = d.bfnState;
      inCall = ['connected', 'dialing', 'incoming'].indexOf(d.bfnState.status) >= 0;
      if (Date.now() - lastSaved > 1500 || inCall) {
        lastSaved = Date.now();
        var o = {}; o['bfnState_' + me] = Object.assign({ ts: Date.now(), id: me }, d.bfnState); save(o);
      }
    }
    if (d.bfnRpcRes) save({ bfnRes: Object.assign({ ts: Date.now() }, d.bfnRpcRes) });
    if (d.bfnCmdRes) save({ bfnCmdRes: Object.assign({ ts: Date.now() }, d.bfnCmdRes) });
    if (d.bfnTemplates) save({ bfnTemplates: d.bfnTemplates });
  });

  // Claim a request so only one open Phone handles it.
  function claim(key, req, done) {
    if (!req || req.claimed || Date.now() - (req.ts || 0) > 30000) return;
    var o = {}; o[key] = Object.assign({}, req, { claimed: me });
    chrome.storage.local.set(o, function () {
      setTimeout(function () {
        chrome.storage.local.get(key, function (r) {
          var d = r[key];
          if (d && d.claimed === me && d.id === req.id) { chrome.storage.local.remove(key); done(d); }
        });
      }, 120);
    });
  }
  function onReq(req) { claim('bfnReq', req, function (d) { window.postMessage({ bfnRpc: { id: d.id, path: d.path, body: d.body || {} } }, location.origin); }); }
  function onCmd(req) {
    if (!req || !req.cmd) return;
    if (CALL_CMDS[req.cmd] && !inCall) return; // let the phone that has the call handle it
    claim('bfnCmd', req, function (d) { window.postMessage({ bfnCmd: { id: d.id, cmd: d.cmd, args: d.args || {} } }, location.origin); });
  }
  chrome.storage.onChanged.addListener(function (ch, area) {
    if (area !== 'local') return;
    if (ch.bfnReq && ch.bfnReq.newValue) onReq(ch.bfnReq.newValue);
    if (ch.bfnCmd && ch.bfnCmd.newValue) onCmd(ch.bfnCmd.newValue);
    if (ch.bfnPing && lastState) { var o = {}; o['bfnState_' + me] = Object.assign({ ts: Date.now(), id: me }, lastState); save(o); }
  });
  setTimeout(function () { chrome.storage.local.get(['bfnReq', 'bfnCmd'], function (r) { onReq(r.bfnReq); onCmd(r.bfnCmd); }); }, 1500);
})();
