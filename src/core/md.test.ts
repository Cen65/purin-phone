import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./md";

/** 零依赖 Markdown 渲染器：安全转义 + 常用子集。 */
describe("renderMarkdown", () => {
  it("先转义再组装，script 注入变成纯文本", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("行内元素：粗体 / 斜体 / 行内代码 / 链接", () => {
    expect(renderMarkdown("**重要**")).toContain("<strong>重要</strong>");
    expect(renderMarkdown("*轻声*")).toContain("<em>轻声</em>");
    expect(renderMarkdown("`const x = 1`")).toContain("<code>const x = 1</code>");
    const link = renderMarkdown("[文档](https://example.com/a?b=1)");
    expect(link).toContain('<a href="https://example.com/a?b=1"');
    expect(link).toContain('target="_blank"');
  });

  it("段落内单换行变成 <br>", () => {
    expect(renderMarkdown("第一行\n第二行")).toBe("<p>第一行<br>第二行</p>");
  });

  it("围栏代码块单独成 pre，内部不做行内渲染", () => {
    const html = renderMarkdown("看代码：\n\n```js\n**不是粗体**\nconst a = 1\n```");
    expect(html).toContain("<pre><code");
    expect(html).toContain("**不是粗体**");
    expect(html).not.toContain("<strong>");
  });

  it("引用块整体变 blockquote，符号被剥掉", () => {
    const html = renderMarkdown("> 引用第一行\n> 引用第二行");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("引用第一行");
    expect(html).not.toContain("&gt;");
  });

  it("空输入返回空字符串", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("   ")).toBe("");
  });
});
