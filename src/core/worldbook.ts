/**
 * 世界书（P3）：给角色/群聊挂载的背景知识库。
 * 一本世界书 = 一组条目；条目按「常驻 / 关键词 / 正则」三种方式触发，
 * 触发后按优先级排序注入提示词：
 * - position: "system"  → 拼进主 system 提示词（世界观设定类）；
 * - position: "context" → 作为补充说明插在最近一条用户消息前（临时背景类）。
 * 本模块只做纯逻辑（触发/排序/格式化/导入解析），存取见 state/worldbookStore.ts。
 */

export type WorldbookEntryMode = "always" | "keyword" | "regex";
export type WorldbookEntryPosition = "system" | "context";

export interface WorldbookEntry {
  id: string;
  /** 条目名（注入时的标题） */
  title: string;
  /** 注入提示词的正文 */
  content: string;
  mode: WorldbookEntryMode;
  /** keyword 模式：触发词列表（任一命中即触发，忽略大小写） */
  keys: string[];
  /** regex 模式：正则源文本（忽略大小写；无效正则永不触发） */
  pattern: string;
  /** 数字越大越靠前，默认 0，范围 -100 ~ 100 */
  priority: number;
  enabled: boolean;
  position: WorldbookEntryPosition;
}

export interface Worldbook {
  id: string;
  name: string;
  description?: string;
  entries: WorldbookEntry[];
  createdAt: number;
}

/** 导入解析后的世界书（还没有 id，由 store 落库时生成） */
export interface WorldbookDraft {
  name: string;
  description?: string;
  entries: Omit<WorldbookEntry, "id">[];
}

/** 关键词/正则扫描最近几条消息（太远的对话不该再触发临时背景） */
export const WORLDBOOK_SCAN_MESSAGES = 8;

export interface WorldbookContext {
  /** 拼进主 system 提示词的段落（position=system 的命中条目） */
  system: string;
  /** 插在最近一条用户消息前的补充段落（position=context 的命中条目） */
  context: string;
}

export const WORLDBOOK_TYPE = "purin.worldbook";

/* ---------------- 触发逻辑 ---------------- */

function compileRegex(pattern: string): RegExp | null {
  if (!pattern.trim()) return null;
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

/** 单个条目在给定扫描文本下是否触发 */
export function entryTriggered(entry: WorldbookEntry, scanText: string): boolean {
  if (!entry.enabled || !entry.content.trim()) return false;
  if (entry.mode === "always") return true;
  if (entry.mode === "keyword") {
    const haystack = scanText.toLowerCase();
    return entry.keys.some((key) => key.trim() && haystack.includes(key.trim().toLowerCase()));
  }
  const regex = compileRegex(entry.pattern);
  return regex ? regex.test(scanText) : false;
}

/** 从最近消息构造扫描文本（供关键词/正则匹配） */
export function scanTextOf(history: { content: string }[], window = WORLDBOOK_SCAN_MESSAGES): string {
  return history
    .slice(-window)
    .map((message) => message.content)
    .join("\n");
}

function formatEntries(entries: WorldbookEntry[]): string {
  return entries.map((entry) => `【${entry.title}】\n${entry.content.trim()}`).join("\n\n");
}

/**
 * 汇总多本世界书 → 注入段落。
 * 传入的 books 由调用方决定（单聊=角色绑定的书；群聊=成员绑定的并集）。
 */
export function collectWorldbookContext(books: Worldbook[], scanText: string): WorldbookContext {
  const triggered = books
    .flatMap((book) => book.entries)
    .filter((entry) => entryTriggered(entry, scanText))
    .sort((a, b) => b.priority - a.priority);
  return {
    system: formatEntries(triggered.filter((entry) => entry.position !== "context")),
    context: formatEntries(triggered.filter((entry) => entry.position === "context")),
  };
}

/* ---------------- 导入 / 导出 ---------------- */

const MODES: WorldbookEntryMode[] = ["always", "keyword", "regex"];
const POSITIONS: WorldbookEntryPosition[] = ["system", "context"];

function normalizeKeys(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,，、]/) : [];
  return list
    .filter((key): key is string => typeof key === "string")
    .map((key) => key.trim())
    .filter(Boolean);
}

function normalizeEntry(raw: unknown, index: number): Omit<WorldbookEntry, "id"> {
  if (!raw || typeof raw !== "object") throw new Error("世界书格式不正确");
  const source = raw as Record<string, unknown>;
  const content = typeof source.content === "string" ? source.content : "";
  const mode = MODES.includes(source.mode as WorldbookEntryMode) ? (source.mode as WorldbookEntryMode) : "keyword";
  return {
    title: typeof source.title === "string" && source.title.trim() ? source.title.trim() : `条目 ${index + 1}`,
    content,
    mode,
    keys: normalizeKeys(source.keys),
    pattern: typeof source.pattern === "string" ? source.pattern : "",
    priority: typeof source.priority === "number" && Number.isFinite(source.priority)
      ? Math.max(-100, Math.min(100, Math.round(source.priority)))
      : 0,
    enabled: typeof source.enabled === "boolean" ? source.enabled : true,
    position: POSITIONS.includes(source.position as WorldbookEntryPosition)
      ? (source.position as WorldbookEntryPosition)
      : "system",
  };
}

/** 解析世界书 JSON（导出格式）；结构不对抛 Error("世界书格式不正确") */
export function parseWorldbookJson(json: string): WorldbookDraft {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("世界书格式不正确");
  }
  if (!raw || typeof raw !== "object") throw new Error("世界书格式不正确");
  const source = raw as Record<string, unknown>;
  if (source.type !== WORLDBOOK_TYPE || !Array.isArray(source.entries)) {
    throw new Error("世界书格式不正确");
  }
  return {
    name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : "导入的世界书",
    description: typeof source.description === "string" && source.description.trim() ? source.description.trim() : undefined,
    entries: source.entries.map((entry, index) => normalizeEntry(entry, index)),
  };
}

/**
 * 解析纯文本世界书（.txt / .md）。块之间用单独一行 --- 分隔，块内格式：
 *   # 标题                （首行，# 可省略）
 *   @常驻                 （或 @关键词: 词1,词2 / @正则: xxx；缺省=关键词=标题）
 *   @优先级: 10           （可省略）
 *   @位置: 近对话         （或 设定区；缺省=设定区）
 *   正文……（其余所有行）
 */
export function parseWorldbookText(text: string): WorldbookDraft {
  const blocks = text
    .split(/\n\s*-{3,}\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blocks.length === 0) throw new Error("世界书内容为空");

  const entries = blocks.map((block, index) => {
    const lines = block.split("\n");
    let title = "";
    const body: string[] = [];
    let mode: WorldbookEntryMode = "keyword";
    let keys: string[] = [];
    let pattern = "";
    let priority = 0;
    let position: WorldbookEntryPosition = "system";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        body.push("");
        continue;
      }
      if (!title && !trimmed.startsWith("@")) {
        title = trimmed.replace(/^#+\s*/, "");
        continue;
      }
      const directive = trimmed.match(/^@(.+)$/);
      if (directive) {
        const [key, ...rest] = directive[1].split(/[:：]/);
        const value = rest.join("：").trim();
        const normalized = key.trim();
        if (normalized === "常驻") mode = "always";
        else if (normalized === "关键词" || normalized === "触发") keys = normalizeKeys(value);
        else if (normalized === "正则") {
          mode = "regex";
          pattern = value;
        } else if (normalized === "优先级") {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) priority = Math.max(-100, Math.min(100, Math.round(parsed)));
        } else if (normalized === "位置") {
          if (value.includes("近") || value.toLowerCase().includes("context")) position = "context";
        }
        continue;
      }
      body.push(line);
    }

    const content = body.join("\n").trim();
    if (mode === "keyword" && keys.length === 0 && title) keys = [title];
    return {
      title: title || `条目 ${index + 1}`,
      content,
      mode,
      keys,
      pattern,
      priority,
      enabled: true,
      position,
    };
  });

  return { name: "导入的世界书", entries };
}

/** 按导出格式序列化（文件内容由调用方下载，见 core/download.ts） */
export function worldbookToJson(book: Worldbook): string {
  return JSON.stringify(
    {
      type: WORLDBOOK_TYPE,
      version: 1,
      name: book.name,
      ...(book.description ? { description: book.description } : {}),
      entries: book.entries.map((entry) => ({
        title: entry.title,
        content: entry.content,
        mode: entry.mode,
        keys: entry.keys,
        pattern: entry.pattern,
        priority: entry.priority,
        enabled: entry.enabled,
        position: entry.position,
      })),
    },
    null,
    2,
  );
}
