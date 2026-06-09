function notifyPopup(data) {
  try { chrome.runtime.sendMessage(data).catch(function () {}); } catch (e) {}
}

async function screenshot(tabId) {
  try {
    notifyPopup({ action: "progress", data: { text: "Measuring page...", pct: 5 } });

    var dimResults = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function () {
        return {
          fullHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
          originalScrollY: window.scrollY,
          originalOverflow: document.body.style.overflow,
        };
      },
    });
    var dims = dimResults && dimResults[0] ? dimResults[0].result : null;
    if (!dims || dims.fullHeight <= 0) {
      notifyPopup({ action: "done", data: { text: "Could not measure page." } });
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function () { document.body.style.overflow = "hidden"; },
    });

    var captures = [];
    var y = 0;
    var step = dims.viewportHeight;

    while (y < dims.fullHeight) {
      var pct = 10 + Math.round((y / dims.fullHeight) * 70);
      notifyPopup({ action: "progress", data: { text: "Capturing... " + Math.round((y / dims.fullHeight) * 100) + "%", pct: pct } });

      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: function (scrollY) { window.scrollTo(0, scrollY); },
        args: [y],
      });

      await new Promise(function (r) { setTimeout(r, 300); });
      var dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
      captures.push({ dataUrl: dataUrl, y: y });
      y += step;
      await new Promise(function (r) { setTimeout(r, 500); });
    }

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function (orig, scrollY) {
        document.body.style.overflow = orig;
        window.scrollTo(0, scrollY);
      },
      args: [dims.originalOverflow, dims.originalScrollY],
    });

    notifyPopup({ action: "progress", data: { text: "Stitching " + captures.length + " captures...", pct: 85 } });

    var stitchResults = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function (captures, viewportWidth, viewportHeight, fullHeight, dpr) {
        return new Promise(function (resolve) {
          var canvasW = viewportWidth * dpr;
          var canvasH = fullHeight * dpr;
          var canvas = document.createElement("canvas");
          canvas.width = canvasW;
          canvas.height = canvasH;
          var ctx = canvas.getContext("2d");
          var loaded = 0;
          captures.forEach(function (cap) {
            var img = new Image();
            img.onload = function () {
              var destY = cap.y * dpr;
              var destH = Math.min(canvasH - destY, canvasW * (img.height / img.width));
              ctx.drawImage(img, 0, destY, canvasW, destH);
              loaded++;
              if (loaded === captures.length) resolve(canvas.toDataURL("image/png"));
            };
            img.onerror = function () {
              loaded++;
              if (loaded === captures.length) resolve(canvas.toDataURL("image/png"));
            };
            img.src = cap.dataUrl;
          });
        });
      },
      args: [captures, dims.viewportWidth, dims.viewportHeight, dims.fullHeight, dims.devicePixelRatio],
    });

    var finalDataUrl = stitchResults && stitchResults[0] ? stitchResults[0].result : null;
    if (!finalDataUrl) {
      notifyPopup({ action: "done", data: { text: "Failed to stitch screenshot." } });
      return;
    }

    notifyPopup({ action: "progress", data: { text: "Saving...", pct: 95 } });
    var timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    chrome.downloads.download({ url: finalDataUrl, filename: "screenshot_" + timestamp + ".png", saveAs: true });
    notifyPopup({ action: "done", data: { text: "Screenshot saved!" } });
  } catch (err) {
    notifyPopup({ action: "done", data: { text: "Error: " + err.message } });
  }
}

function twitterScanScript() {
  var report = [];

  function cs(el, prop) { return getComputedStyle(el)[prop] || ''; }
  function nodeDesc(el, depth) {
    if (!el || el === document.body) return;
    var style = getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    return (depth || 0) + ': ' + el.tagName
      + ' id=' + (el.id || '-')
      + ' pos=' + style.position
      + ' display=' + style.display
      + ' w=' + Math.round(rect.width) + ' left=' + Math.round(rect.left)
      + ' class=' + el.className.toString().substring(0, 80);
  }

  // Header parent chain
  report.push('=== HEADER[role=banner] PARENT CHAIN ===');
  var header = document.querySelector('header[role="banner"]');
  if (header) {
    var node = header, d = 0;
    while (node && node !== document.body && d < 12) {
      report.push(nodeDesc(node, d)); node = node.parentElement; d++;
    }
  } else { report.push('header[role=banner] NOT FOUND'); }

  // Main flex row (first flex ancestor of primaryColumn)
  report.push('\n=== FLEX ROW (ancestor of primaryColumn) ===');
  var primary = document.querySelector('[data-testid="primaryColumn"]');
  if (primary) {
    var n = primary.parentElement, found = false;
    while (n && n !== document.body) {
      if (cs(n, 'display') === 'flex' || cs(n, 'display') === 'inline-flex') {
        report.push('flex row: ' + nodeDesc(n));
        Array.from(n.children).forEach(function (child, i) {
          var r = child.getBoundingClientRect();
          report.push('  child[' + i + ']: ' + child.tagName
            + ' w=' + Math.round(r.width) + ' left=' + Math.round(r.left)
            + ' pos=' + cs(child, 'position')
            + ' flex=' + cs(child, 'flex')
            + ' class=' + child.className.toString().substring(0, 80));
        });
        found = true; break;
      }
      n = n.parentElement;
    }
    if (!found) report.push('no flex ancestor found');
  }

  // Primary column itself
  report.push('\n=== PRIMARY COLUMN ===');
  if (primary) {
    var r = primary.getBoundingClientRect();
    report.push('left=' + Math.round(r.left) + ' width=' + Math.round(r.width));
    report.push(nodeDesc(primary.parentElement, 0));
  }

  var text = report.join('\n');
  var blob = new Blob([text], { type: 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'twitter_scan.txt';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === "screenshot") {
    screenshot(message.tabId);
    sendResponse({ started: true });
  } else if (message.action === "twitter-scan") {
    chrome.scripting.executeScript({ target: { tabId: message.tabId }, func: twitterScanScript });
    sendResponse({ started: true });
  } else if (message.action === "download-text") {
    var mime = message.mime || "text/plain";
    var url = "data:" + mime + ";charset=utf-8," + encodeURIComponent(message.content || "");
    chrome.downloads.download({
      url: url,
      filename: message.filename || "download.txt",
      conflictAction: "uniquify"
    }, function (downloadId) {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true, downloadId: downloadId });
      }
    });
    return true;
  }
  return true;
});
