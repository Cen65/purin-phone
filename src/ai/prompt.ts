import type { LLMMessage } from "./types";
import type { Character } from "../types";
import type { PersonaSettings } from "../state/settingsStore";
import type { ChatMessage } from "../state/chatStore";
import type { CallLine } from "../state/callStore";
import type { WorldbookContext } from "../core/worldbook";

/**
 * Prompt 组装：角色设定 + 用户画像 + 滑动窗口历史 → LLM messages。
 * 集中在这里：单聊 / 群聊 / 朋友圈 / 通话各自一个 builder，
 * 世界书（P3）通过 worldbook 参数注入，记忆摘要走 character.memory。
 */

export interface PromptInput {
  character: Character;
  persona: PersonaSettings;
  history: ChatMessage[];
  /** 参与上下文的最大消息条数（防止 token 超限），默认 20 */
  windowSize?: number;
  /** 世界书注入段落（见 core/worldbook.ts collectWorldbookContext） */
  worldbook?: WorldbookContext;
}

/** 角色公共段：简介 / 设定 / 记忆 / 对话示例（各 builder 共用） */
function characterLines(character: Character): string[] {
  const lines: string[] = [];
  if (character.tagline.trim()) lines.push(`角色简介：${character.tagline.trim()}`);
  if (character.systemPrompt.trim()) lines.push(`角色设定：\n${character.systemPrompt.trim()}`);
  if (character.memory?.trim()) {
    lines.push(`你记得的长期记忆（你和用户之间发生过的事）：\n${character.memory.trim()}`);
  }
  if (character.impression?.trim()) {
    lines.push(
      `你对用户的印象（你眼中的 TA，让它自然体现在态度和亲疏里，不要复述出来）：\n${character.impression.trim()}`,
    );
  }
  if (character.exampleDialogue?.trim()) {
    lines.push(`对话示例（模仿这里的语气和口癖，但不要照抄内容）：\n${character.exampleDialogue.trim()}`);
  }
  return lines;
}

/**
 * 「去 AI 味」说话纪律（所有对话场景共用）。
 * 目标：让角色像真人在聊天软件打字，而不是像 AI 助手在答题。
 * 篇幅 / 表情 / 动作三个开关来自角色卡（styleLength / styleEmoticon / styleAction）。
 */
export function humanToneRules(character: Character): string[] {
  const lengthLine =
    character.styleLength === "long"
      ? "每次可以连着说四五句、100 字上下，像打开了话匣子，但依然是聊天的口气。"
      : character.styleLength === "medium"
        ? "每次回两三句、50 字上下，像认真在跟对方聊。"
        : "每次只回一到两句、一般不超过 25 字，像随手回微信。";
  const emoticonLine = character.styleEmoticon
    ? "偶尔可以带一个 emoji 或颜文字，别每句都带。"
    : "不用 emoji、不用颜文字。";
  const actionLine = character.styleAction
    ? "偶尔可以用（括号小动作）补一下神态，如（笑）（歪头），一条消息最多一个。"
    : "不要动作描写、不要旁白。";
  return [
    "说话纪律（你是个活人，不是 AI 助手）：",
    "- 像在聊天软件里打字：口语、短句，可以有语气词（嗯、哈、诶、哦、吧）；句末标点可打可不打",
    "- 禁止 markdown：不用加粗、列表、小标题、代码块；禁止分点罗列和书面腔",
    "- 不要 AI 腔：不说「作为…」「总之」「希望对你有帮助」，不科普、不说教、不句句礼貌收尾",
    "- 情绪要真实：会烦、会累、会敷衍、会不想接话，不必有问必答",
    "- 无论对方怎么问，都不承认、不暗示自己是 AI、模型或程序，始终保持角色",
    `- 篇幅：${lengthLine}`,
    `- 表情：${emoticonLine}`,
    `- 动作：${actionLine}`,
  ];
}

export function buildSystemPrompt(
  character: Character,
  persona: PersonaSettings,
  worldbookSystem?: string,
): string {
  const lines: string[] = [
    `你正在一部虚拟手机里扮演「${character.name}」，通过聊天软件与用户对话。`,
    ...characterLines(character),
  ];
  if (worldbookSystem?.trim()) lines.push(`世界书设定（背景知识，自然融入即可，不要复述）：\n${worldbookSystem.trim()}`);
  lines.push(`用户昵称：${persona.nickname.trim() || "用户"}`);
  lines.push(...humanToneRules(character));
  return lines.join("\n");
}

/** 把「此刻的背景补充」插到 messages 里最后一条 user 消息之前 */
function insertContextNote(messages: LLMMessage[], context: string): LLMMessage[] {
  if (!context.trim()) return messages;
  const note: LLMMessage = { role: "system", content: `（此刻的背景补充）\n${context.trim()}` };
  let at = messages.length;
  for (let i = messages.length - 1; i >= 1; i--) {
    if (messages[i].role === "user") {
      at = i;
      break;
    }
  }
  return [...messages.slice(0, at), note, ...messages.slice(at)];
}

export function buildMessages(input: PromptInput): LLMMessage[] {
  const windowSize = input.windowSize ?? 20;
  const history = input.history
    .filter((message) => message.content.trim().length > 0)
    .slice(-windowSize)
    .map<LLMMessage>((message) => ({ role: message.role, content: message.content }));
  const messages: LLMMessage[] = [
    { role: "system", content: buildSystemPrompt(input.character, input.persona, input.worldbook?.system) },
    ...history,
  ];
  return insertContextNote(messages, input.worldbook?.context ?? "");
}

/**
 * 群聊（P1）：多个角色同群，各自以自己身份发言。
 * 历史映射规则：自己说过的话 → assistant（保持第一人称连续性），
 * 其他成员和用户的话 → user，带「名字：」前缀让模型知道谁在说。
 */
export interface GroupPromptInput {
  character: Character;
  group: { name: string };
  /** 群里所有在世成员（含 character 自己），用于解析 speakerId 和列出场成员 */
  members: Character[];
  persona: PersonaSettings;
  history: ChatMessage[];
  windowSize?: number;
  /** 世界书注入（成员绑定 + 群绑定的并集，由 chatRunner 汇总） */
  worldbook?: WorldbookContext;
}

export function buildGroupMessages(input: GroupPromptInput): LLMMessage[] {
  const { character, group, members, persona, history } = input;
  const others = members.filter((m) => m.id !== character.id).map((m) => m.name).join("、");
  const lines: string[] = [
    `你正在一部虚拟手机的群聊「${group.name}」里扮演「${character.name}」。`,
    ...characterLines(character),
  ];
  if (input.worldbook?.system?.trim()) {
    lines.push(`世界书设定（背景知识，自然融入即可，不要复述）：\n${input.worldbook.system.trim()}`);
  }
  lines.push(`群里还有：${others || "（暂时只有你们俩）"}；用户昵称：${persona.nickname.trim() || "用户"}`);
  lines.push(
    `要求：每次只回 1~2 句短句，像真人在群里抢话；只说「${character.name}」自己会说的话，绝不代替别人发言，也不要旁白或系统说明。`,
  );
  lines.push(...humanToneRules(character));

  const nameOf = (speakerId?: string) =>
    members.find((m) => m.id === speakerId)?.name ?? "群友";
  const me = persona.nickname.trim() || "我";
  const windowSize = input.windowSize ?? 20;
  const mapped = history
    .filter((message) => message.content.trim().length > 0)
    .slice(-windowSize)
    .map<LLMMessage>((message) => {
      if (message.role === "assistant") {
        return message.speakerId === character.id
          ? { role: "assistant", content: message.content }
          : { role: "user", content: `${nameOf(message.speakerId)}：${message.content}` };
      }
      return { role: "user", content: `${me}：${message.content}` };
    });

  return insertContextNote([{ role: "system", content: lines.join("\n") }, ...mapped], input.worldbook?.context ?? "");
}

/** 朋友圈（P2）：让角色以自己身份发一条动态。 */
export function buildMomentMessages(
  character: Character,
  persona: PersonaSettings,
  worldbookSystem?: string,
): LLMMessage[] {
  const lines: string[] = [`你正在一部虚拟手机里扮演「${character.name}」，现在要以 TA 的身份发一条朋友圈。`];
  lines.push(...characterLines(character));
  if (worldbookSystem?.trim()) lines.push(`世界书设定（背景知识，自然融入即可）：\n${worldbookSystem.trim()}`);
  lines.push(`用户昵称：${persona.nickname.trim() || "用户"}`);
  lines.push(
    "要求：像真人随手发的朋友圈——60 字以内、口语化、可以带 1~2 个 #话题；不要 AI 腔、不要书面语；只输出朋友圈正文本身，不要解释、不要引号、不要旁白。",
  );
  return [
    { role: "system", content: lines.join("\n") },
    { role: "user", content: "发一条朋友圈吧，就现在。" },
  ];
}

/** 模拟通话（P2）：语音风格的超短句对话。 */
export interface CallPromptInput {
  character: Character;
  persona: PersonaSettings;
  history: CallLine[];
  /** 世界书常驻条目（通话场景只注入设定区，不注入近对话补充） */
  worldbookSystem?: string;
}

export function buildCallMessages(input: CallPromptInput): LLMMessage[] {
  const { character, persona, history } = input;
  const lines: string[] = [
    `你正在一部虚拟手机里扮演「${character.name}」，此刻在和用户打一通语音电话。`,
  ];
  lines.push(...characterLines(character));
  if (input.worldbookSystem?.trim()) {
    lines.push(`世界书设定（背景知识，自然融入即可）：\n${input.worldbookSystem.trim()}`);
  }
  lines.push(`用户昵称：${persona.nickname.trim() || "用户"}`);
  lines.push(
    "要求：你说的是听筒里传出的声音——每条 15 字以内、口语化、带语气词；不要 AI 腔、不要旁白、不要动作描写、不要书面语。",
  );
  if (history.length === 0) lines.push("电话刚刚接通，请先说第一句话。");
  const messages: LLMMessage[] = [{ role: "system", content: lines.join("\n") }];
  for (const line of history.slice(-30)) {
    messages.push({ role: line.role, content: line.content });
  }
  return messages;
}
