/**
 * 零依赖 Markdown 渲染器（聊天气泡用）。
 * 支持子集：段落/换行、**粗体**、*斜体*、`行内代码`、```代码块```、
 * [链接](https://…)、> 引用。先整体 HTML 转义再组装标签，天然防注入。
 * 这里的目标是"AI 回复好看"，不是完整 Markdown——刻意保持小而可测。
 */

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => ESCAPE_MAP[ch] ?? ch);
}

/** 行内元素：`code` → **bold** → *italic* → 链接。顺序重要（避免嵌套误吞）。 */
function renderInline(text: string): string {
  let out = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return out;
}

const CODE_PLACEHOLDER = "\u0000CODE";

/** 把 Markdown 源文本渲染成 HTML 片段（输入已转义，输出可安全注入）。 */
export function renderMarkdown(source: string): string {
  if (!source.trim()) return "";
  const escaped = escapeHtml(source);

  // 1. 围栏代码块先摘出来（内部不做任何行内渲染）
  const codeBlocks: string[] = [];
  let text = escaped.replace(/```([^\n]*)\n?([\s\S]*?)```/g, (_match, lang: string, body: string) => {
    const index = codeBlocks.length;
    const cls = lang.trim() ? ` class="lang-${lang.trim().slice(0, 16)}"` : "";
    codeBlocks.push(`<pre><code${cls}>${body.replace(/\n$/, "")}</code></pre>`);
    return `${CODE_PLACEHOLDER}${index}\u0000`;
  });

  // 2. 按空行分块：整块引用 / 普通段落（单换行 → <br>）
  const html = text
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      const alone = trimmed.match(/^\u0000CODE(\d+)\u0000$/);
      if (alone) return codeBlocks[Number(alone[1])] ?? "";
      const lines = trimmed.split("\n");
      if (lines.every((line) => line.startsWith("&gt;") || line === "")) {
        const quoted = lines.map((line) => line.replace(/^&gt; ?/, "")).join("<br>");
        return `<blockquote>${renderInline(quoted)}</blockquote>`;
      }
      return `<p>${lines.map(renderInline).join("<br>")}</p>`;
    })
    .join("");

  // 3. 兜底：没被单独成块的代码块占位符（比如紧跟正文）原位替换
  return html.replace(/\u0000CODE(\d+)\u0000/g, (_m, index: string) => codeBlocks[Number(index)] ?? "");
}
