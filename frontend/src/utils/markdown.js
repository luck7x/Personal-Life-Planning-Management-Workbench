export function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

export function renderMarkdown(value) {
  const blocks = [];
  const lines = value.split(/\r?\n/);
  let listItems = [];

  function flushList() {
    if (listItems.length) {
      blocks.push(`<ul>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
      listItems = [];
    }
  }

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      blocks.push(`<h2>${renderInlineMarkdown(trimmed.slice(3))}</h2>`);
      return;
    }
    if (trimmed.startsWith("### ")) {
      flushList();
      blocks.push(`<h3>${renderInlineMarkdown(trimmed.slice(4))}</h3>`);
      return;
    }
    if (trimmed.startsWith("- ")) {
      listItems.push(trimmed.slice(2));
      return;
    }
    flushList();
    blocks.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  });

  flushList();
  return blocks.join("");
}
