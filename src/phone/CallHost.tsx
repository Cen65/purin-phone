import { useEffect, useRef, useState } from "react";
import { useCallStore, formatCallDuration } from "../state/callStore";
import { useCharactersStore } from "../state/charactersStore";
import { callReply } from "../ai/creative";
import { Icon } from "../core/icons";
import { AvatarView } from "../core/avatars";
import { bus } from "../core/events";

const QUICK_LINES = ["喂？", "在吗", "哈哈哈", "挂了啊"];

/**
 * 模拟来电/通话层（P2）：盖在所有 App 之上（低于锁屏）。
 * 通话 = 语音风格的超短句文字对话；挂断后转写自动存进该角色的普通聊天。
 */
export function CallHost() {
  const phase = useCallStore((s) => s.phase);
  const characterId = useCallStore((s) => s.characterId);
  const lines = useCallStore((s) => s.lines);
  const startedAt = useCallStore((s) => s.startedAt);
  const endedReason = useCallStore((s) => s.endedReason);
  const accept = useCallStore((s) => s.accept);
  const decline = useCallStore((s) => s.decline);
  const pushLine = useCallStore((s) => s.pushLine);
  const hangup = useCallStore((s) => s.hangup);
  const reset = useCallStore((s) => s.reset);

  const character = useCharactersStore((s) =>
    characterId ? s.characters.find((c) => c.id === characterId) : undefined,
  );

  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [elapsed, setElapsed] = useState("00:00");
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase !== "active" || !startedAt) return;
    const timer = window.setInterval(() => setElapsed(formatCallDuration(startedAt)), 500);
    return () => window.clearInterval(timer);
  }, [phase, startedAt]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [lines.length, thinking]);

  // 接通后让对方先开口
  useEffect(() => {
    if (phase !== "active" || !characterId || lines.length > 0) return;
    let cancelled = false;
    setThinking(true);
    callReply(characterId)
      .then((reply) => {
        if (!cancelled) pushLine("assistant", reply);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        bus.emit("notify", { kind: "error", title: "通话失败", body: message.slice(0, 80) });
      })
      .finally(() => {
        if (!cancelled) setThinking(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, characterId]);

  if (phase === "idle" || !characterId) return null;

  if (phase === "incoming") {
    return (
      <div className="call-layer call-incoming">
        <AvatarView avatar={character?.avatar ?? "📞"} size={84} className="call-avatar-big" />
        <div className="call-name">{character?.name ?? "未知来电"}</div>
        <div className="call-sub">来电……</div>
        <div className="call-actions">
          <button type="button" className="call-btn call-decline" onClick={decline} aria-label="拒接">
            <Icon name="phone-off" size={22} />
          </button>
          <button type="button" className="call-btn call-accept" onClick={accept} aria-label="接听">
            <Icon name="phone" size={22} />
          </button>
        </div>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className="call-layer call-ended">
        <AvatarView avatar={character?.avatar ?? "📞"} size={84} className="call-avatar-big" />
        <div className="call-name">{endedReason ?? "通话结束"}</div>
        <button type="button" className="call-done" onClick={reset}>
          完成
        </button>
      </div>
    );
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || !characterId || thinking) return;
    setDraft("");
    pushLine("user", content);
    setThinking(true);
    try {
      const reply = await callReply(characterId);
      pushLine("assistant", reply);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      bus.emit("notify", { kind: "error", title: "通话失败", body: message.slice(0, 80) });
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="call-layer call-active">
      <div className="call-head">
        <AvatarView avatar={character?.avatar ?? "📞"} size={36} className="call-avatar" />
        <span className="call-name">{character?.name ?? "通话"}</span>
        <span className="call-timer">{elapsed}</span>
      </div>
      <div className="call-transcript" ref={transcriptRef}>
        {lines.map((line) => (
          <div key={line.id} className={`call-line ${line.role === "user" ? "call-line-mine" : ""}`}>
            {line.content}
          </div>
        ))}
        {thinking && <div className="call-line call-line-thinking">……</div>}
      </div>
      <div className="call-quick">
        {QUICK_LINES.map((quick) => (
          <button key={quick} type="button" className="call-quick-btn" disabled={thinking} onClick={() => send(quick)}>
            {quick}
          </button>
        ))}
      </div>
      <div className="call-input-row">
        <input
          className="call-input"
          value={draft}
          placeholder="说点什么……"
          disabled={thinking}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send(draft);
          }}
        />
        <button type="button" className="call-send" disabled={thinking || !draft.trim()} onClick={() => void send(draft)}>
          <Icon name="send" size={16} />
        </button>
        <button type="button" className="call-hangup" onClick={() => hangup("通话结束")}>
          <Icon name="phone-off" size={14} /> 挂断
        </button>
      </div>
    </div>
  );
}
