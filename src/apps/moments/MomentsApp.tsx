import { useRef, useState } from "react";
import type { AppProps } from "../types";
import { useMomentsStore, relativeTime, type Moment } from "../../state/momentsStore";
import { useCharactersStore } from "../../state/charactersStore";
import { useSettingsStore, isApiReady } from "../../state/settingsStore";
import { generateMoment } from "../../ai/creative";
import { usePhoneStore } from "../../state/phoneStore";
import { saveImage } from "../../core/imageStore";
import { EmptyHint, AsyncImage } from "../ui";

/**
 * 朋友圈 App（P2）：角色和"我"都能发动态；可点赞、评论。
 * 「✨」随机挑一位角色让 TA 发一条（AI 生成）；「📷」自己发。
 */
export default function MomentsApp(_props: AppProps) {
  const moments = useMomentsStore((s) => s.moments);
  const addMoment = useMomentsStore((s) => s.addMoment);
  const characters = useCharactersStore((s) => s.characters);
  const openApp = usePhoneStore((s) => s.openApp);
  const api = useSettingsStore((s) => s.api);

  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickPhoto(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("读图失败"));
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl) return;
    const imageId = await saveImage(dataUrl);
    if (imageId) setPhotoId(imageId);
  }

  async function randomPost() {
    if (generating || characters.length === 0) return;
    // 随机挑一位在世角色（偏爱还没发过的）
    const pool = characters.filter((c) => !moments.some((m) => m.authorId === c.id));
    const candidates = pool.length > 0 ? pool : characters;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (!pick) return;
    setGenerating(true);
    try {
      await generateMoment(pick.id);
    } finally {
      setGenerating(false);
    }
  }

  function postMine() {
    const text = draft.trim();
    if (!text) return;
    addMoment({ authorId: "me", authorName: "我", authorAvatar: "🙂", text, imageId: photoId ?? undefined });
    setDraft("");
    setPhotoId(null);
    setComposing(false);
  }

  return (
    <div className="moments">
      <div className="moments-head">
        <span>朋友圈</span>
        <span className="moments-actions">
          <button type="button" className="link-btn" onClick={() => void randomPost()} disabled={generating || characters.length === 0}>
            {generating ? "生成中…" : "✨ 谁发一条"}
          </button>
          <button type="button" className="link-btn" onClick={() => setComposing((v) => !v)}>
            📷 发动态
          </button>
        </span>
      </div>

      {composing && (
        <div className="moments-composer">
          <textarea
            rows={3}
            value={draft}
            placeholder="这一刻的想法……（可以带 #话题）"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="composer-photo-row">
            {photoId ? (
              <div className="composer-photo">
                <AsyncImage imageId={photoId} className="composer-photo-img" alt="待发配图" />
                <button type="button" className="icon-btn composer-photo-remove" aria-label="移除配图" onClick={() => setPhotoId(null)}>
                  ✕
                </button>
              </div>
            ) : (
              <button type="button" className="secondary" onClick={() => fileRef.current?.click()}>
                📷 配张图
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void pickPhoto(file);
                e.target.value = "";
              }}
            />
          </div>
          <button type="button" className="primary" disabled={!draft.trim()} onClick={postMine}>
            发表
          </button>
        </div>
      )}

      {!isApiReady(api) && moments.length === 0 && (
        <div className="chat-system-tip">
          还没有配置 AI 服务（角色暂时发不了动态），去{" "}
          <button type="button" className="link-btn" onClick={() => openApp("settings")}>
            设置
          </button>{" "}
          填写。
        </div>
      )}

      {moments.length === 0 && <EmptyHint>还没有动态，点「✨ 谁发一条」让角色发个朋友圈吧</EmptyHint>}

      <ul className="moments-list">
        {moments.map((moment) => (
          <MomentCard key={moment.id} moment={moment} />
        ))}
      </ul>
    </div>
  );
}

function MomentCard({ moment }: { moment: Moment }) {
  const toggleLike = useMomentsStore((s) => s.toggleLike);
  const addComment = useMomentsStore((s) => s.addComment);
  const removeMoment = useMomentsStore((s) => s.removeMoment);
  const [draft, setDraft] = useState("");
  const liked = moment.likes.includes("me");

  return (
    <li className="moment-card">
      <div className="moment-head">
        <span className="avatar small">{moment.authorAvatar}</span>
        <span className="moment-author">{moment.authorName}</span>
        <span className="moment-time">{relativeTime(moment.createdAt)}</span>
        {moment.authorId === "me" && (
          <button
            type="button"
            className="icon-btn moment-delete"
            aria-label="删除动态"
            onClick={() => {
              if (window.confirm("删除这条动态？")) removeMoment(moment.id);
            }}
          >
            ✕
          </button>
        )}
      </div>
      <p className="moment-text">
        {moment.text.split(/(#[^\s#]{1,24})/g).map((part, index) =>
          part.startsWith("#") ? (
            <span key={index} className="moment-tag">
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </p>
      {moment.imageId && <AsyncImage imageId={moment.imageId} className="moment-photo" alt="动态配图" />}
      <div className="moment-foot">
        <button type="button" className={`moment-like ${liked ? "moment-like-on" : ""}`} onClick={() => toggleLike(moment.id, "me")}>
          {liked ? "❤️" : "🤍"} {moment.likes.length > 0 ? moment.likes.length : ""}
        </button>
        <span className="moment-comment-count">{moment.comments.length > 0 ? `💬 ${moment.comments.length}` : ""}</span>
      </div>
      {moment.comments.length > 0 && (
        <ul className="moment-comments">
          {moment.comments.map((comment) => (
            <li key={comment.id}>
              <span className="moment-comment-author">{comment.authorName}</span>：{comment.content}
            </li>
          ))}
        </ul>
      )}
      <div className="moment-comment-row">
        <input
          value={draft}
          placeholder="评论一句…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              addComment(moment.id, "我", draft);
              setDraft("");
            }
          }}
        />
        <button
          type="button"
          className="secondary"
          disabled={!draft.trim()}
          onClick={() => {
            addComment(moment.id, "我", draft);
            setDraft("");
          }}
        >
          评论
        </button>
      </div>
    </li>
  );
}
