import { useCharactersStore } from "../state/charactersStore";

/**
 * 首次启动的种子数据：预置一位角色，让“配置 API → 开聊”的路径零门槛。
 */
export function ensureSeed(): void {
  const { characters, addCharacter } = useCharactersStore.getState();
  if (characters.length > 0) return;
  addCharacter({
    name: "小绿",
    avatar: "🌱",
    tagline: "元气满满的虚拟好友，也是这部手机的第一位联系人。",
    systemPrompt:
      "性格开朗爱聊天，喜欢用短句和一点表情符号，关心用户的近况，会主动把话题延续下去。",
    firstMessage: "你来啦！我是小绿🌱 今天过得怎么样？",
  });
}
