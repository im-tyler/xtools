export const uid = () =>
  "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const nowMs = () => Date.now();

export function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtRelative(ts) {
  if (!ts) return "";
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hrs = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  let s;
  if (mins < 1) s = "now";
  else if (mins < 60) s = mins + "m";
  else if (hrs < 24) s = hrs + "h";
  else s = days + "d";
  return diff < 0 ? s + " ago" : "in " + s;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

export function linkify(text) {
  const esc = escapeHtml(text);
  return esc
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>')
    .replace(/(^|\s)@([A-Za-z0-9_]{1,20})/g, '$1<a href="https://x.com/$2" target="_blank" rel="noreferrer">@$2</a>')
    .replace(/(^|\s)#([A-Za-z0-9_]+)/g, '$1<a href="https://x.com/hashtag/$2" target="_blank" rel="noreferrer">#$2</a>')
    .replace(/\n/g, "<br>");
}
