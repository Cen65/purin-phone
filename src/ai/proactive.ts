import type { LLMMessage } from "./types";
import type { Character } from "../types";
import type { ChatMessage } from "../state/chatStore";
import { chatOnce, generateMoment } from "./creative";
import { humanToneRules } from "./prompt";
import { useSettingsStore, isApiReady, type PersonaSettings } from "../state/settingsStore";
import { useProactiveStore } from "../state/proactiveStore";
import { useCharactersStore } from "../state/charactersStore";
import { useChatStore } from "../state/chatStore";
import { usePhoneStore } from "../state/phoneStore";
import { bus } from "../core/events";

/**
 * 主动消息：角色自己找话题给你发消息（应用打开期间运行）。
 *
 * 节奏模型：每个角色有「下次到期时间」= 上次主动发消息时间 + 最小间隔 + 随机抖动；
 * 从未主动发过的角色，启用后 3~10 分钟内来第一条（让新用户尽快看到角色"活"起来）。
 * 引擎每 checkMinutes 巡检一次，每轮最多发 1 条（避免轰炸）。
 * 角色作息（sleepFrom/sleepTo）内不打扰；用户 30 分钟内刚说过话的不主动（人家在线聊着呢）。
 */

const MINUTE_MS = 60 * 1000;
/** 用户最近发言窗口：这段时间内不主动发消息 */
const RECENT_CHAT_WINDOW_MS = 30 * MINUTE_MS;
/** 每轮巡检最多主动发送的角色数 */
const ROUND_CAP = 1;

/** "HH:mm" → 当天分钟数；非法返回 null */
export function parseHM(value?: string): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 角色此刻是否在作息睡眠区间（支持跨午夜，如 23:00–07:00） */
export function isSleeping(character: Pick<Character, "sleepFrom" | "sleepTo">, date: Date): boolean {
  const from = parseHM(character.sleepFrom);
  const to = parseHM(character.sleepTo);
  if (from === null || to === null || from === to) return false;
  const m = date.getHours() * 60 + date.getMinutes();
  return from < to ? m >= from && m < to : m >= from || m < to;
}

/**
 * 计算角色的「下次到期时间」。
 * lastAt 为空（从未主动发过）：now + 3~10 分钟（rand∈[0,1)）；
 * 否则：lastAt + gap + 0~gap/2 的抖动，让节奏不那么机械。
 */
export function nextDueAt(
  lastAt: number | undefined,
  gapMinutes: number,
  rand: () => number = Math.random,
  now: number = Date.now(),
): number {
  const gap = Math.max(1, gapMinutes) * MINUTE_MS;
  if (lastAt === undefined) return now + 3 * MINUTE_MS + Math.floor(rand() * 7 * MINUTE_MS);
  return lastAt + gap + Math.floor(rand() * (gap / 2));
}

export interface DueContext {
  now?: number;
  apiReady?: boolean;
  engineOn?: boolean;
  gapMinutes?: number;
  /** characterId → 该会话里用户最近一次发言时间（在线聊天保护） */
  lastUserAt?: Record<string, number>;
  /** characterId → 该会话是否正在生成中 */
  generating?: Record<string, boolean>;
  rand?: () => number;
}

/** 挑出此刻应该主动发消息的角色（按到期先后排序） */
export function pickDueCharacters(characters: Character[], ctx: DueContext = {}): Character[] {
  const now = ctx.now ?? Date.now();
  if (ctx.engineOn === false || ctx.apiReady === false) return [];
  const gapMinutes = ctx.gapMinutes ?? 120;
  const rand = ctx.rand ?? Math.random;
  const date = new Date(now);

  return characters
    .filter((c) => c.proactiveEnabled !== false)
    .filter((c) => !isSleeping(c, date))
    .filter((c) => !(ctx.generating ?? {})[c.id])
    .filter((c) => {
      const lastUser = (ctx.lastUserAt ?? {})[c.id];
      return lastUser === undefined || now - lastUser > RECENT_CHAT_WINDOW_MS;
    })
    .map((c) => ({ c, due: nextDueAt((useProactiveStore.getState().lastAt)[c.id], gapMinutes, rand, now) }))
    .filter(({ due }) => now >= due)
    .sort((a, b) => a.due - b.due)
    .slice(0, ROUND_CAP)
    .map(({ c }) => c);
}

/** 主动消息的提示词：强调"此刻你主动找Ta"，附时间与久未联系的上下文 */
export function buildProactiveMessages(input: {
  character: Character;
  persona: PersonaSettings;
  history: ChatMessage[];
  now?: number;
}): LLMMessage[] {
  const { character, persona, history, now = Date.now() } = input;
  const d = new Date(now);
  const hour = d.getHours();
  const part = hour < 5 ? "深夜" : hour < 11 ? "早上" : hour < 14 ? "中午" : hour < 18 ? "下午" : hour < 23 ? "晚上" : "夜里";
  const me = persona.nickname?.trim() || "我";
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const since = lastUser
    ? Math.max(0, Math.round((now - lastUser.createdAt) / (60 * MINUTE_MS)))
    : null;

  const lines = [
    `你是「${character.name}」${character.tagline ? `，${character.tagline}` : ""}，正在和${me}用手机聊天。`,
  ];
  if (character.systemPrompt.trim()) lines.push(character.systemPrompt.trim());
  if (character.memory?.trim()) lines.push(`你记得的长期记忆（你和${me}之间发生过的事）：\n${character.memory.trim()}`);
  if (character.exampleDialogue?.trim()) lines.push(`对话示例（模仿这里的语气和口癖，但不要照抄内容）：\n${character.exampleDialogue.trim()}`);
  lines.push(
    `现在是${part}（${d.getMonth() + 1}月${d.getDate()}日 ${hour}点前后）。` +
      (since === null
        ? `你主动给${me}发来了第一条消息。`
        : `距离你们上次聊天大约过去了 ${since} 小时，你此刻自发地想找${me}说点什么。`),
  );
  lines.push(...humanToneRules(character));
  lines.push(
    `只输出这一条消息本身（15~60 字）：像随手发的微信，符合你的性格；可以分享心情、发发牢骚、问问${me}在干嘛，或接着之前的话题。不要旁白、不要引号、不要解释你在做什么。`,
  );

  const messages: LLMMessage[] = [{ role: "system", content: lines.join("\n\n") }];
  for (const m of history.slice(-10)) {
    if (m.status === "streaming") continue;
    messages.push({ role: m.role, content: m.content });
  }
  return messages;
}

export interface ProactiveSend {
  characterId: string;
  characterName: string;
  content: string;
}

/** 跑一轮：挑选到期角色 → 生成 → 写进会话 → 通知/角标。返回本轮发出的消息。 */
export async function runProactiveRound(now: number = Date.now()): Promise<ProactiveSend[]> {
  const settings = useSettingsStore.getState();
  const proactive = useProactiveStore.getState();
  const characters = useCharactersStore.getState().characters;
  const chat = useChatStore.getState();

  const lastUserAt: Record<string, number> = {};
  const generating: Record<string, boolean> = {};
  for (const c of characters) {
    const msgs = chat.messages[c.id] ?? [];
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (lastUser) lastUserAt[c.id] = lastUser.createdAt;
    generating[c.id] = Boolean(chat.generating[c.id]);
  }

  const due = pickDueCharacters(characters, {
    now,
    apiReady: isApiReady(settings.api),
    engineOn: proactive.engineOn,
    gapMinutes: proactive.gapMinutes,
    lastUserAt,
    generating,
  });

  const sent: ProactiveSend[] = [];
  for (const character of due) {
    try {
      const messages = buildProactiveMessages({
        character,
        persona: settings.persona,
        history: useChatStore.getState().messages[character.id] ?? [],
        now,
      });
      const raw = await chatOnce(messages);
      const content = raw.trim().slice(0, 300);
      if (!content) throw new Error("空回复");
      useChatStore.getState().insertMessage(character.id, "assistant", content);
      useProactiveStore.getState().touch(character.id, now);
      bus.emit("notify", { appId: "chat", title: character.name, body: content });
      if (usePhoneStore.getState().activeAppId !== "chat") {
        usePhoneStore.getState().bumpBadge("chat");
      }
      sent.push({ characterId: character.id, characterName: character.name, content });
    } catch (error) {
      // 失败也记一次时间：按完整间隔退避，避免坏配置下每轮重试轰炸
      useProactiveStore.getState().touch(character.id, now);
      console.warn("[proactive] 主动消息失败", character.name, error);
    }
  }
  return sent;
}

let engineTimer: ReturnType<typeof setInterval> | null = null;

/* ── 朋友圈自动发帖 ────────────────────────────────────────────
 * 与主动消息共用一个巡检节拍：每轮挑一个「到期的」角色让 TA 发条朋友圈。
 * 节奏：lastMomentAt + momentGapMinutes（+抖动）；从未发过的角色视为随时可发。
 * 睡眠作息内不发（睡着的人不刷朋友圈）；每轮最多 1 条。 */

export interface MomentPosterContext {
  now?: number;
  momentsOn?: boolean;
  gapMinutes?: number;
  lastMomentAt?: Record<string, number>;
  rand?: () => number;
}

/** 挑出此刻该发朋友圈的角色（0 或 1 个）；到期候选里随机挑，避免永远固定顺序 */
export function pickMomentPoster(
  characters: Character[],
  ctx: MomentPosterContext = {},
): Character | null {
  const now = ctx.now ?? Date.now();
  if (ctx.momentsOn === false) return null;
  const gap = Math.max(1, ctx.gapMinutes ?? 240) * MINUTE_MS;
  const rand = ctx.rand ?? Math.random;
  const date = new Date(now);

  const due = characters
    .filter((c) => !isSleeping(c, date))
    .filter((c) => {
      const last = (ctx.lastMomentAt ?? {})[c.id];
      if (last === undefined) return true; // 从没发过：视为到期
      return now >= last + gap + rand() * (gap / 2);
    });
  if (due.length === 0) return null;
  return due[Math.floor(rand() * due.length)] ?? null;
}

/** 跑一轮朋友圈：挑到期角色 → generateMoment（内部已做通知/角标/事件）→ 记时间退避 */
export async function runMomentRound(now: number = Date.now()): Promise<string[]> {
  const settings = useSettingsStore.getState();
  const proactive = useProactiveStore.getState();
  const characters = useCharactersStore.getState().characters;

  const poster = pickMomentPoster(characters, {
    now,
    // 朋友圈自动发帖跟随两个开关：momentsOn 自己的开关 + 引擎总开关
    momentsOn: proactive.momentsOn && proactive.engineOn,
    gapMinutes: proactive.momentGapMinutes,
    lastMomentAt: proactive.lastMomentAt,
  });
  // API 未配置时不挑人（避免必然失败的生成）
  if (!poster || !isApiReady(settings.api)) return [];

  const posted: string[] = [];
  try {
    const moment = await generateMoment(poster.id);
    if (moment) posted.push(moment.id);
  } catch (error) {
    console.warn("[moments] 自动发帖失败", poster.name, error);
  } finally {
    // 成功失败都记时间：按完整间隔退避，避免坏配置下每轮重试
    useProactiveStore.getState().touchMoment(poster.id, now);
  }
  return posted;
}

/** 启动巡检引擎（浏览器端，main.tsx 调用；重复调用幂等）。返回停止函数。 */
export function startProactiveEngine(): () => void {
  if (typeof window === "undefined") return () => {};
  if (engineTimer !== null) return () => stopProactiveEngine();
  const tick = () => {
    void runProactiveRound().catch((error) => console.warn("[proactive] 巡检异常", error));
    void runMomentRound().catch((error) => console.warn("[moments] 巡检异常", error));
  };
  engineTimer = setInterval(tick, useProactiveStore.getState().checkMinutes * MINUTE_MS);
  // 页面从后台切回前台时补一轮（后台定时器可能被浏览器节流错过了到期点）
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });
  return () => stopProactiveEngine();
}

export function stopProactiveEngine(): void {
  if (engineTimer !== null) {
    clearInterval(engineTimer);
    engineTimer = null;
  }
}
