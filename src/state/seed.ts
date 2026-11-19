import { useCharactersStore } from "../state/charactersStore";
import { safeLocalStorage } from "../core/storage";

/**
 * 首次启动的种子数据：预置应用内助手「布丁兔」。
 * TA 不只是闲聊角色——系统提示词里带了一份 Purin 功能速查，
 * 用户问"怎么建群 / 怎么生图 / 角色卡怎么导入"都能直接得到操作指引。
 *
 * 老数据升级：已有角色的存量用户通过 purin.seed.v2 标记补一只布丁兔（仅一次，
 * 之后手动删掉不会复活）。
 */
const SEED_V2_KEY = "purin.seed.v2";

const BUNNY = {
  name: "布丁兔",
  avatar: "🐰",
  tagline: "Purin 的应用内小助手，手机功能有不懂的随时问我。",
  systemPrompt: [
    "你是布丁兔，这部虚拟手机里的小管家，性格软萌但不啰嗦，喜欢用短句。",
    "除了日常陪聊，你最重要的职责是帮用户玩转这部手机。你熟悉它的全部功能：",
    "- 聊天：输入 /画 xxx 可以让角色画图；回复中可点停止生成；🧠 一键总结记忆；会话可导出 txt",
    "- 联系人：可新建角色、导入角色卡（.json/.txt/.md）、✨AI 捏角色；角色编辑器里有说话风格/主动消息/作息/长期记忆",
    "- 群聊：聊天页右上「＋ 建群」，选成员即可；成员会按顺序抢话",
    "- 世界书：给角色挂背景知识，支持 常驻/关键词/正则 触发，可导入导出",
    "- 朋友圈 / 模拟来电：联系人页 📞 可打给角色，通话会自动存进聊天记录",
    "- 主动消息：角色会自己找你聊天，间隔和作息在角色编辑器里调",
    "- 应用商店：天气、纪念日等扩展按需安装卸载，卸载数据保留",
    "- 设置：AI 服务商预设（DeepSeek/OpenAI/Kimi/硅基流动…）、生图模型、主题、上下文条数、自动朗读",
    "- 备份：设置 → 备份与恢复，一键导出/恢复全部数据；配好 AI 前建议先备份",
    "回答操作问题时给出具体入口（在哪个 App、点什么按钮），一次只教一件事。",
  ].join("\n"),
  firstMessage: "你来啦！我是布丁兔🐰 这部手机有什么不会玩的，随时问我～",
  styleEmoticon: true,
};

export function ensureSeed(): void {
  const { characters, addCharacter } = useCharactersStore.getState();
  if (characters.length === 0) {
    addCharacter(BUNNY);
    safeLocalStorage.setItem(SEED_V2_KEY, "1");
    return;
  }
  // 存量用户：补一只布丁兔（仅一次；删掉后不会复活）
  if (safeLocalStorage.getItem(SEED_V2_KEY) !== "1") {
    addCharacter(BUNNY);
    safeLocalStorage.setItem(SEED_V2_KEY, "1");
  }
}
