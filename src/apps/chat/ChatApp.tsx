import { useEffect, useRef, useState } from "react";
import type { AppProps } from "../types";
import { useChatStore, type ChatMessage } from "../../state/chatStore";
import { useCharactersStore } from "../../state/charactersStore";
import { useGroupsStore, groupConversationId, livingMembers, type Group } from "../../state/groupsStore";
import { usePhoneStore } from "../../state/phoneStore";
import { useSettingsStore, isApiReady } from "../../state/settingsStore";
import { sendMessage, sendGroupMessage, regenerate, stopGeneration } from "../../ai/chatRunner";
import { renderMarkdown } from "../../core/md";
import { downloadTextFile } from "../../core/download";
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

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  function create() {
    if (selected.length === 0) return;
    const group = addGroup(name, selected);
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
      <button type="button" className="primary" disabled={selected.length === 0} onClick={create}>
        创建（已选 {selected.length} 人）
      </button>
    </div>
  );
}

/* ---------------- 消息气泡 ---------------- */

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
  return (
    <div className={`bubble-row ${isUser ? "mine" : ""}`}>
      {!isUser && speakerAvatar && <span className="avatar small">{speakerAvatar}</span>}
      <div className={`bubble ${message.status === "error" ? "bubble-error" : ""}`}>
        {!isUser && speakerName && <div className="msg-speaker">{speakerName}</div>}
        {isUser ? (
          message.content
        ) : (
          <div
            className="md"
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(message.content || (message.status === "streaming" ? "…" : "")),
            }}
          />
        )}
        {message.status === "streaming" && message.content && <span className="stream-cursor">▋</span>}
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
  const api = useSettingsStore((s) => s.api);
  const nickname = useSettingsStore((s) => s.persona.nickname);
  const [draft, setDraft] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const bottomRef = useRef<HTMLDivElement>(null);

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
        <span className="chat-tools">
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
        <input
          value={draft}
          placeholder={generating ? "对方正在输入…" : `发消息给 ${character.name}`}
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
    </div>
  );
}

/* ---------------- 群聊 ---------------- */

function GroupConversation({ group }: { group: Group }) {
  const openApp = usePhoneStore((s) => s.openApp);
  const characters = useCharactersStore((s) => s.characters);
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
