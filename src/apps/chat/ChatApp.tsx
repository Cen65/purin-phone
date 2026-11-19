import { useEffect, useRef, useState } from "react";
import type { AppProps } from "../types";
import { useChatStore, type ChatMessage } from "../../state/chatStore";
import { useCharactersStore } from "../../state/charactersStore";
import { useGroupsStore, groupConversationId, livingMembers, type Group, type GroupReplyMode } from "../../state/groupsStore";
import { usePhoneStore } from "../../state/phoneStore";
import { useSettingsStore, isApiReady } from "../../state/settingsStore";
import { sendMessage, sendGroupMessage, regenerate, stopGeneration } from "../../ai/chatRunner";
import { mergeMemory } from "../../ai/memory";
import { mergeImpression } from "../../ai/impression";
import { renderMarkdown } from "../../core/md";
import { downloadTextFile } from "../../core/download";
import { loadImage } from "../../core/imageStore";
import { speak, stopSpeaking, asrSupported, listen } from "../../core/tts";
import { bus } from "../../core/events";
import type { Character } from "../../types";

/**
 * 聊天 App：会话列表（私聊 + 群聊）→ 聊天界面。
 * 发送/停止/重试逻辑在 src/ai/chatRunner.ts，本组件只做展示与输入。
 * 长会话用分页渲染（默认渲染最近 60 条，「加载更早」往前翻），代替虚拟滚动。
 */

const PAGE_SIZE = 60;

export default function ChatApp(_props: AppProps) {
  const params = usePhoneStore((s) => s.params["chat"]) as { characterId?: string; groupId?: string } | undefined;
  const characterId = params?.characterId;
  const groupId = params?.groupId;
  const character = useCharactersStore((s) => (characterId ? s.characters.find((c) => c.id === characterId) : undefined));
  const group = useGroupsStore((s) => (groupId ? s.groups.find((g) => g.id === groupId) : undefined));

  if (character) return <Conversation key={character.id} character={character} />;
  if (group) return <GroupConversation key={group.id} group={group} />;
  return <ConversationList />;
}

/* ---------------- 会话列表 ---------------- */

function ConversationList() {
  const characters = useCharactersStore((s) => s.characters);
  const groups = useGroupsStore((s) => s.groups);
  const messages = useChatStore((s) => s.messages);
  const openApp = usePhoneStore((s) => s.openApp);
  const [composing, setComposing] = useState(false);

  return (
    <div className="chat-list-page">
      <div className="chat-list-head">
        <span>聊天</span>
        <button type="button" className="link-btn" onClick={() => setComposing((v) => !v)}>
          {composing ? "取消" : "+ 建群"}
        </button>
      </div>
      {composing && <GroupComposer onDone={() => setComposing(false)} />}
      {characters.length === 0 && groups.length === 0 && (
        <div className="chat-empty">
          <p>还没有可以聊天的联系人</p>
          <button type="button" onClick={() => openApp("contacts")}>
            去联系人创建
          </button>
        </div>
      )}
      {groups.length > 0 && (
        <ul className="chat-list">
          {groups.map((group) => {
            const history = messages[groupConversationId(group.id)] ?? [];
            const last = history[history.length - 1];
            return (
              <li key={group.id}>
                <button
                  type="button"
                  className="chat-list-row"
                  onClick={() => openApp("chat", { groupId: group.id })}
                >
                  <span className="avatar">👪</span>
                  <span className="chat-list-main">
                    <span className="chat-list-name">{group.name}</span>
                    <span className="chat-list-preview">
                      {last ? last.content.replace(/\n/g, " ").slice(0, 40) || "…" : `${group.memberIds.length} 人群聊`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ul className="chat-list">
        {characters.map((character) => {
          const history = messages[character.id] ?? [];
          const last = history[history.length - 1];
          return (
            <li key={character.id}>
              <button
                type="button"
                className="chat-list-row"
                onClick={() => openApp("chat", { characterId: character.id })}
              >
                <span className="avatar">{character.avatar}</span>
                <span className="chat-list-main">
                  <span className="chat-list-name">{character.name}</span>
                  <span className="chat-list-preview">
                    {last ? last.content.replace(/\n/g, " ").slice(0, 40) || "…" : character.tagline}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GroupComposer({ onDone }: { onDone: () => void }) {
  const characters = useCharactersStore((s) => s.characters);
  const addGroup = useGroupsStore((s) => s.addGroup);
  const openApp = usePhoneStore((s) => s.openApp);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [replyMode, setReplyMode] = useState<GroupReplyMode>("all");

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  function create() {
    if (selected.length === 0) return;
    const group = addGroup(name, selected, replyMode);
    onDone();
    openApp("chat", { groupId: group.id });
  }

  return (
    <div className="group-composer">
      <input
        value={name}
        placeholder="群名称（默认「新群聊」）"
        onChange={(e) => setName(e.target.value)}
      />
      <div className="group-composer-members">
        {characters.map((character) => (
          <button
            key={character.id}
            type="button"
            className={`chip ${selected.includes(character.id) ? "chip-on" : ""}`}
            onClick={() => toggle(character.id)}
          >
            {character.avatar} {character.name}
          </button>
        ))}
      </div>
      <div className="field">
        <label>抢答方式</label>
        <ReplyModeSelect value={replyMode} onChange={setReplyMode} />
      </div>
      <button type="button" className="primary" disabled={selected.length === 0} onClick={create}>
        创建（已选 {selected.length} 人）
      </button>
    </div>
  );
}

const REPLY_MODE_OPTIONS: { value: GroupReplyMode; label: string }[] = [
  { value: "all", label: "全员按序" },
  { value: "random", label: "随机抢答（每轮 1~2 人）" },
  { value: "weighted", label: "话痨优先（按性格加权）" },
];

function ReplyModeSelect({ value, onChange }: { value: GroupReplyMode; onChange: (mode: GroupReplyMode) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as GroupReplyMode)}>
      {REPLY_MODE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/* ---------------- 消息气泡 ---------------- */

/** 生图消息的图片本体：从 IndexedDB 懒加载 dataURL */
function ChatImage({ imageId, prompt, pending }: { imageId?: string; prompt: string; pending: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    if (imageId) {
      void loadImage(imageId).then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) setSrc(dataUrl);
        else setFailed(true);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [imageId]);

  if (pending) {
    return (
      <div className="chat-image-pending">
        <span className="chat-image-spinner">🎨</span> 正在画：{prompt.slice(0, 60)}
      </div>
    );
  }
  if (failed) return <div className="chat-image-pending">（这张图找不回来了，可能被浏览器清理）</div>;
  if (!src) return <div className="chat-image-pending">图片加载中…</div>;
  return <img className="chat-image" src={src} alt={prompt.slice(0, 60)} loading="lazy" />;
}

function Bubble({
  message,
  speakerName,
  speakerAvatar,
  onRegenerate,
}: {
  message: ChatMessage;
  speakerName?: string;
  speakerAvatar?: string;
  onRegenerate?: () => void;
}) {
  const isUser = message.role === "user";
  const isImage = message.kind === "image";
  return (
    <div className={`bubble-row ${isUser ? "mine" : ""}`}>
      {!isUser && speakerAvatar && <span className="avatar small">{speakerAvatar}</span>}
      <div className={`bubble ${message.status === "error" ? "bubble-error" : ""}`}>
        {!isUser && speakerName && <div className="msg-speaker">{speakerName}</div>}
        {isUser ? (
          message.content
        ) : isImage ? (
          <ChatImage imageId={message.imageId} prompt={message.content} pending={message.status === "streaming"} />
        ) : (
          <div
            className="md"
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(message.content || (message.status === "streaming" ? "…" : "")),
            }}
          />
        )}
        {message.status === "streaming" && !isImage && message.content && <span className="stream-cursor">▋</span>}
        {!isUser && message.status === "done" && !isImage && message.content && (
          <button type="button" className="link-btn bubble-speak" onClick={() => speak(message.content)}>
            🔊 朗读
          </button>
        )}
        {message.status === "error" && (
          <div className="bubble-error-detail">
            <span>{message.error}</span>
            {onRegenerate && (
              <button type="button" className="link-btn" onClick={onRegenerate}>
                重新生成
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- 单聊 ---------------- */

function Conversation({ character }: { character: Character }) {
  const openApp = usePhoneStore((s) => s.openApp);
  const messages = useChatStore((s) => s.messages[character.id]) ?? [];
  const generating = useChatStore((s) => s.generating[character.id]) ?? false;
  const clearConversation = useChatStore((s) => s.clearConversation);
  const ensureFirstMessage = useChatStore((s) => s.ensureFirstMessage);
  const updateCharacter = useCharactersStore((s) => s.updateCharacter);
  const api = useSettingsStore((s) => s.api);
  const nickname = useSettingsStore((s) => s.persona.nickname);
  const voiceAutoSpeak = useSettingsStore((s) => s.voiceAutoSpeak);
  const setVoiceAutoSpeak = useSettingsStore((s) => s.setVoiceAutoSpeak);
  const [draft, setDraft] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState<string | null>(null);
  const [impressionBusy, setImpressionBusy] = useState(false);
  const [impressionDraft, setImpressionDraft] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const listenStopRef = useRef<(() => void) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const visible = messages.slice(-visibleCount);
  const hasMore = messages.length > visible.length;
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastMessage?.content]);

  // 离开会话时停掉朗读和听写
  useEffect(
    () => () => {
      stopSpeaking();
      listenStopRef.current?.();
    },
    [],
  );

  // 自动朗读：新的 AI 文字回复完成时朗读（生图消息不读）
  useEffect(() => {
    if (!voiceAutoSpeak) return;
    if (lastMessage?.role === "assistant" && lastMessage.status === "done" && lastMessage.kind !== "image") {
      speak(lastMessage.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage?.id, lastMessage?.status, voiceAutoSpeak]);

  // 开场白：会话为空时自动说第一句（清空记录后回到开场白）
  useEffect(() => {
    if (character.firstMessage) ensureFirstMessage(character.id, character.firstMessage);
  }, [character.id, character.firstMessage, messages.length, ensureFirstMessage]);

  const toggleListening = () => {
    if (listening) {
      listenStopRef.current?.();
      listenStopRef.current = null;
      setListening(false);
      return;
    }
    setListening(true);
    listenStopRef.current = listen(
      (text) => setDraft((current) => (current ? `${current} ${text}` : text)),
      (error) => {
        setListening(false);
        listenStopRef.current = null;
        if (error) bus.emit("notify", { kind: "error", title: "语音输入", body: error });
      },
    );
  };

  const summarizeMemory = async () => {
    if (memoryBusy || generating || messages.length < 4) return;
    setMemoryBusy(true);
    try {
      setMemoryDraft(await mergeMemory(character.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      bus.emit("notify", { kind: "error", title: "记忆总结失败", body: message.slice(0, 80) });
    } finally {
      setMemoryBusy(false);
    }
  };

  const summarizeImpression = async () => {
    if (impressionBusy || generating || messages.length < 4) return;
    setImpressionBusy(true);
    try {
      setImpressionDraft(await mergeImpression(character.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      bus.emit("notify", { kind: "error", title: "印象生成失败", body: message.slice(0, 80) });
    } finally {
      setImpressionBusy(false);
    }
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || generating) return;
    setDraft("");
    void sendMessage(character.id, text);
  };

  return (
    <div className="chat-room">
      <header className="chat-room-header">
        <button type="button" className="icon-btn" onClick={() => openApp("chat")} aria-label="返回会话列表">
          ‹
        </button>
        <span className="avatar small">{character.avatar}</span>
        <span className="chat-room-name">{character.name}</span>
        <span className="affection-chip" title="好感度与心情（随聊天自动变化，可在联系人编辑里调整）">
          💗 {character.affection ?? 50} · {character.mood ?? "平静"}
        </span>
        <span className="chat-tools">
          <button
            type="button"
            className={`icon-btn ${voiceAutoSpeak ? "icon-btn-on" : ""}`}
            title={voiceAutoSpeak ? "自动朗读已开（点击关闭）" : "自动朗读 AI 回复"}
            aria-label="自动朗读"
            onClick={() => {
              const next = !voiceAutoSpeak;
              setVoiceAutoSpeak(next);
              if (!next) stopSpeaking();
            }}
          >
            {voiceAutoSpeak ? "🔊" : "🔇"}
          </button>
          <button
            type="button"
            className="icon-btn"
            title="印象档案（TA 眼中的你，影响态度与亲疏）"
            aria-label="印象档案"
            disabled={impressionBusy || generating || messages.length < 4}
            onClick={() => void summarizeImpression()}
          >
            {impressionBusy ? "⏳" : "👁"}
          </button>
          <button
            type="button"
            className="icon-btn"
            title="总结记忆（把最近的聊天要点合进长期记忆）"
            aria-label="总结记忆"
            disabled={memoryBusy || generating || messages.length < 4}
            onClick={() => void summarizeMemory()}
          >
            {memoryBusy ? "⏳" : "🧠"}
          </button>
          <button
            type="button"
            className="icon-btn"
            title="导出聊天记录"
            aria-label="导出聊天记录"
            onClick={() => {
              const me = nickname.trim() || "我";
              const text = messages
                .map((m) => `${m.role === "user" ? me : character.name}：${m.content}`)
                .join("\n");
              downloadTextFile(`${character.name}-聊天记录.txt`, text || "（暂无消息）");
            }}
          >
            ⬇
          </button>
          <button
            type="button"
            className="icon-btn"
            title="清空聊天记录"
            aria-label="清空聊天记录"
            onClick={() => {
              if (window.confirm(`清空与 ${character.name} 的聊天记录？`)) clearConversation(character.id);
            }}
          >
            🧹
          </button>
        </span>
      </header>

      <div className="chat-messages">
        {!isApiReady(api) && (
          <div className="chat-system-tip">
            还没有配置 AI 服务，去{" "}
            <button type="button" className="link-btn" onClick={() => openApp("settings")}>
              设置
            </button>{" "}
            填写后即可开聊。
          </div>
        )}
        {hasMore && (
          <div className="load-earlier">
            <button type="button" className="link-btn" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
              加载更早的消息（还有 {messages.length - visible.length} 条）
            </button>
          </div>
        )}
        {visible.map((message) => (
          <Bubble
            key={message.id}
            message={message}
            onRegenerate={message.status === "error" ? () => void regenerate(character.id) : undefined}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <footer className="chat-input-bar">
        {asrSupported() && (
          <button
            type="button"
            className={`icon-btn mic-btn ${listening ? "mic-btn-on" : ""}`}
            title={listening ? "结束语音输入" : "语音输入"}
            aria-label="语音输入"
            onClick={toggleListening}
          >
            🎤
          </button>
        )}
        <input
          value={draft}
          placeholder={
            listening
              ? "正在听…（说完点 🎤 结束）"
              : generating
                ? "对方正在输入…"
                : `发消息给 ${character.name}（/画 xxx 可生图）`
          }
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          disabled={generating}
        />
        {generating ? (
          <button type="button" className="stop-btn" onClick={() => stopGeneration(character.id)}>
            停止
          </button>
        ) : (
          <button type="button" className="primary" onClick={submit} disabled={!draft.trim()}>
            发送
          </button>
        )}
      </footer>

      {memoryDraft !== null && (
        <div className="modal-mask" onClick={() => setMemoryDraft(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3 className="modal-title">🧠 总结记忆 · {character.name}</h3>
            <p className="modal-hint">
              AI 把最近的聊天要点合并成了这份长期记忆（原有记忆尽量保留）。可手动修改，保存后随设定一起注入提示词。
            </p>
            <textarea
              className="modal-textarea"
              rows={8}
              value={memoryDraft}
              onChange={(event) => setMemoryDraft(event.target.value)}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="primary"
                disabled={!memoryDraft.trim()}
                onClick={() => {
                  updateCharacter(character.id, {
                    memory: memoryDraft.trim(),
                    // 手动保存也推进游标，避免自动巩固马上把同一段对话再滚一遍
                    memoryCursor: messages[messages.length - 1]?.id,
                  });
                  setMemoryDraft(null);
                  bus.emit("notify", { title: "记忆已更新", body: `${character.name} 会记得这些事` });
                }}
              >
                保存记忆
              </button>
              <button type="button" className="secondary" onClick={() => setMemoryDraft(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {impressionDraft !== null && (
        <div className="modal-mask" onClick={() => setImpressionDraft(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3 className="modal-title">👁 印象档案 · {character.name} 眼中的你</h3>
            <p className="modal-hint">
              这是 {character.name} 对你的印象（性格/喜好/关系远近）。可手动修改，保存后注入提示词，影响
              TA 对你的态度和亲疏。
            </p>
            <textarea
              className="modal-textarea"
              rows={8}
              placeholder="- TA 是个……"
              value={impressionDraft}
              onChange={(event) => setImpressionDraft(event.target.value)}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="primary"
                disabled={!impressionDraft.trim()}
                onClick={() => {
                  updateCharacter(character.id, {
                    impression: impressionDraft.trim(),
                    // 推进游标，避免自动巩固立刻把旧对话再滚一遍
                    impressionCursor: messages.at(-1)?.id,
                  });
                  setImpressionDraft(null);
                  bus.emit("notify", { title: "印象已更新", body: `${character.name} 看你的眼光变了` });
                }}
              >
                保存印象
              </button>
              <button type="button" className="secondary" onClick={() => setImpressionDraft(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 群聊 ---------------- */

function GroupConversation({ group }: { group: Group }) {
  const openApp = usePhoneStore((s) => s.openApp);
  const characters = useCharactersStore((s) => s.characters);
  const updateGroup = useGroupsStore((s) => s.updateGroup);
  const conversationId = groupConversationId(group.id);
  const messages = useChatStore((s) => s.messages[conversationId]) ?? [];
  const generating = useChatStore((s) => s.generating[conversationId]) ?? false;
  const clearConversation = useChatStore((s) => s.clearConversation);
  const nickname = useSettingsStore((s) => s.persona.nickname);
  const [draft, setDraft] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const bottomRef = useRef<HTMLDivElement>(null);

  const members = livingMembers(group, characters);
  const visible = messages.slice(-visibleCount);
  const hasMore = messages.length > visible.length;
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastMessage?.content]);

  const submit = () => {
    const text = draft.trim();
    if (!text || generating) return;
    setDraft("");
    void sendGroupMessage(group.id, text);
  };

  const nameOf = (speakerId?: string) =>
    characters.find((c) => c.id === speakerId)?.name ?? group.name;

  return (
    <div className="chat-room">
      <header className="chat-room-header">
        <button type="button" className="icon-btn" onClick={() => openApp("chat")} aria-label="返回会话列表">
          ‹
        </button>
        <span className="avatar small">👪</span>
        <span className="chat-room-main">
          <span className="chat-room-name">{group.name}</span>
          <span className="chat-room-sub">{members.map((m) => m.name).join("、") || "成员都已删除"}</span>
        </span>
        <span className="chat-tools">
          <select
            className="group-reply-mode"
            value={group.replyMode ?? "all"}
            title="抢答方式"
            aria-label="抢答方式"
            onChange={(e) => updateGroup(group.id, { replyMode: e.target.value as GroupReplyMode })}
          >
            {REPLY_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-btn"
            title="导出聊天记录"
            aria-label="导出聊天记录"
            onClick={() => {
              const me = nickname.trim() || "我";
              const text = messages
                .map((m) => `${m.role === "user" ? me : nameOf(m.speakerId)}：${m.content}`)
                .join("\n");
              downloadTextFile(`${group.name}-聊天记录.txt`, text || "（暂无消息）");
            }}
          >
            ⬇
          </button>
          <button
            type="button"
            className="icon-btn"
            title="清空聊天记录"
            aria-label="清空聊天记录"
            onClick={() => {
              if (window.confirm(`清空「${group.name}」的聊天记录？`)) clearConversation(conversationId);
            }}
          >
            🧹
          </button>
        </span>
      </header>

      <div className="chat-messages">
        {members.length === 0 && (
          <div className="chat-system-tip">群成员都已被删除，去通讯录添加角色后再来聊天。</div>
        )}
        {hasMore && (
          <div className="load-earlier">
            <button type="button" className="link-btn" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
              加载更早的消息（还有 {messages.length - visible.length} 条）
            </button>
          </div>
        )}
        {visible.map((message) => (
          <Bubble
            key={message.id}
            message={message}
            speakerName={message.role === "assistant" ? nameOf(message.speakerId) : undefined}
            speakerAvatar={
              message.role === "assistant"
                ? characters.find((c) => c.id === message.speakerId)?.avatar
                : undefined
            }
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <footer className="chat-input-bar">
        <input
          value={draft}
          placeholder={generating ? "群里正在回复…" : `发消息到 ${group.name}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          disabled={generating || members.length === 0}
        />
        {generating ? (
          <button type="button" className="stop-btn" onClick={() => stopGeneration(conversationId)}>
            停止
          </button>
        ) : (
          <button type="button" className="primary" onClick={submit} disabled={!draft.trim() || members.length === 0}>
            发送
          </button>
        )}
      </footer>
    </div>
  );
}
