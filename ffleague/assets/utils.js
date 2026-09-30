export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function n(value, digits = 2) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toFixed(digits) : "0.00";
}

export function pct(value, digits = 1) {
  const num = Number(value || 0) * 100;
  return `${num.toFixed(digits)}%`;
}

export function sum(values) {
  return values.reduce((acc, v) => acc + Number(v || 0), 0);
}

export function average(values) {
  if (!values.length) return 0;
  return sum(values) / values.length;
}

export function byDesc(a, b) {
  return b - a;
}

export function text(el, value) {
  if (el) el.textContent = value;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function create(tag, className = "", textContent = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textContent) el.textContent = textContent;
  return el;
}

export function groupBy(list, keySelector) {
  return list.reduce((acc, item) => {
    const key = keySelector(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

export function unique(list) {
  return Array.from(new Set(list));
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function compareStr(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

export function dateLabel(tsMs) {
  if (!tsMs) return "";
  return new Date(tsMs).toLocaleString();
}

export function playoffWeek(league) {
  const pw = Number(league?.settings?.playoff_week_start || 15);
  return Number.isFinite(pw) ? pw : 15;
}
