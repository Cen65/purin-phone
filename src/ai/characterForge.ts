import type { LLMMessage } from "./types";
import type { CharacterDraft } from "../state/charactersStore";
import { chatOnce } from "./creative";

/**
 * AI 捏人（P3）：填一张简单问卷 → 一次 LLM 调用生成完整角色草稿。
 * 输出字段与手动编辑器一致（name/avatar/tagline/systemPrompt/firstMessage/memory），
 * 生成后用户可再编辑保存——AI 只负责初稿，不改已有角色。
 */

export interface ForgeInput {
  gender?: string;
  age?: string;
  personality?: string;
  speakingStyle?: string;
  relationship?: string;
  notes?: string;
}

export function buildForgeMessages(input: ForgeInput): LLMMessage[] {
  const answers = [
    ["性别", input.gender],
    ["年龄段", input.age],
    ["性格", input.personality],
    ["说话风格", input.speakingStyle],
    ["和用户的关系", input.relationship],
    ["补充设定", input.notes],
  ]
    .filter(([, value]) => value && value.trim())
    .map(([key, value]) => `- ${key}：${value!.trim()}`)
    .join("\n");

  const system = [
    "你是虚拟手机 App 里的角色设计师，根据一份简单的设定问卷，设计一个立体的聊天角色。",
    "只输出一个 JSON 对象，不要 markdown 代码块、不要解释。字段：",
    '  "name"：名字（2~6 个字，好听、符合人设）',
    '  "avatar"：一个最贴合人设的 emoji',
    '  "tagline"：一句话简介（15 字以内）',
    '  "systemPrompt"：完整角色设定（80~200 字：性格、口癖、说话习惯、背景、和用户相处的方式）',
    '  "firstMessage"：角色发出的第一条聊天消息（30 字以内，口语化，符合人设）',
    '  "memory"：初始记忆（可有可无，30 字以内）',
    "设定要有细节和反差感，避免「温柔善良」这类空泛形容词堆砌。",
  ].join("\n");
  const user = `设定问卷：\n${answers || "（几乎空白，请自由发挥一个有意思的角色）"}\n\n请生成角色 JSON。`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** 从模型输出中提取 JSON（容错：剥掉 ```json 围栏 / 前后闲话）并转成角色草稿 */
export function parseForgeResult(raw: string): CharacterDraft {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("生成结果无法解析，请重试");
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new Error("生成结果无法解析，请重试");
  }
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name) throw new Error("生成结果缺少名字，请重试");
  const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");
  const draft: CharacterDraft = {
    name,
    avatar: text("avatar").slice(0, 4) || "🙂",
    tagline: text("tagline").slice(0, 60),
    systemPrompt: text("systemPrompt").slice(0, 2000),
  };
  const firstMessage = text("firstMessage").slice(0, 200);
  if (firstMessage) draft.firstMessage = firstMessage;
  const memory = text("memory").slice(0, 300);
  if (memory) draft.memory = memory;
  return draft;
}

/** 问卷 → 角色草稿（调用已配置的 AI；失败抛错由 UI 提示） */
export async function forgeCharacter(input: ForgeInput): Promise<CharacterDraft> {
  const raw = await chatOnce(buildForgeMessages(input));
  return parseForgeResult(raw);
}
