import { useState, useRef } from "react";
import { useTheme } from "./ThemeProvider";
import type { Conversation } from "../types";
import logoImg from "/logo.png";

function ConversationItem({
  conv,
  activeId,
  onSelectConv,
  onToggleArchive,
  onDeleteConv,
  onRename,
  onShare,
  archived,
}: {
  conv: Conversation;
  activeId: string | null;
  onSelectConv: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onDeleteConv: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onShare: (id: string) => void;
  archived: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(conv.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
    setTitle(conv.title);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = () => {
    const t = title.trim() || "新对话";
    setTitle(t);
    setEditing(false);
    if (t !== conv.title) onRename(conv.id, t);
  };

  return (
    <div
      className={`sidebar-item ${conv.id === activeId ? "sidebar-item-active" : ""} ${archived ? "sidebar-item-archived" : ""}`}
      onClick={() => onSelectConv(conv.id)}
      onDoubleClick={startEdit}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="sidebar-rename-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setTitle(conv.title); setEditing(false); }
          }}
          onClick={(e) => e.stopPropagation()}
          maxLength={100}
        />
      ) : (
        <span className="sidebar-item-title">{conv.title || "新对话"}</span>
      )}
      <button className="sidebar-item-delete" onClick={(e) => { e.stopPropagation(); onToggleArchive(conv.id); }} title={archived ? "取消归档" : "归档"}>
        {archived ? "📤" : "📥"}
      </button>
      <button className="sidebar-item-delete" onClick={(e) => { e.stopPropagation(); onShare(conv.id); }} title="分享">🔗</button>
      <button className="sidebar-item-delete" onClick={(e) => { e.stopPropagation(); onDeleteConv(conv.id); }} title="删除">🗑</button>
    </div>
  );
}

export function Sidebar({
  conversations,
  activeId,
  onNewChat,
  onSelectConv,
  onDeleteConv,
  onToggleArchive,
  onRename,
  onShare,
  collapsed,
  onToggle,
  userAvatar,
  userDisplayName,
  onSettingsClick,
  onLogout,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onNewChat: () => void;
  onSelectConv: (id: string) => void;
  onDeleteConv: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onShare: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  userAvatar: string | null;
  userDisplayName: string;
  onSettingsClick: () => void;
  onLogout: () => void;
}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      {!collapsed && <div className="sidebar-overlay" onClick={onToggle} />}
      <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
        <div className="sidebar-header">
          <button className="btn-sidebar-toggle" onClick={onToggle}>{collapsed ? "☰" : "✕"}</button>
          {!collapsed && (
            <>
              <div className="sidebar-logo">
                <img className="sidebar-logo-img" src={logoImg} alt="宁翼智能助手" />
                <span className="sidebar-logo-text">宁翼智能助手</span>
              </div>
              <button className="btn-new-chat" onClick={onNewChat}>＋ 新对话</button>
            </>
          )}
        </div>
        {!collapsed && (
          <>
            <div className="sidebar-history">
              {conversations.length === 0 ? (
                <div className="sidebar-empty">暂无历史记录</div>
              ) : (
                <>
                  {conversations.filter((c) => !c.archived).map((conv) => (
                    <ConversationItem key={conv.id} conv={conv} activeId={activeId}
                      onSelectConv={onSelectConv} onToggleArchive={onToggleArchive}
                      onDeleteConv={onDeleteConv} onRename={onRename} onShare={onShare} archived={false} />
                  ))}
                  {conversations.some((c) => c.archived) && (
                    <div className="sidebar-section-label">已归档</div>
                  )}
                  {conversations.filter((c) => c.archived).map((conv) => (
                    <ConversationItem key={conv.id} conv={conv} activeId={activeId}
                      onSelectConv={onSelectConv} onToggleArchive={onToggleArchive}
                      onDeleteConv={onDeleteConv} onRename={onRename} onShare={onShare} archived={true} />
                  ))}
                </>
              )}
            </div>
            <div className="sidebar-footer">
              <div className="sidebar-footer-item" onClick={toggleTheme} role="button">
                <span>{theme === "dark" ? "☀️" : "🌙"}</span>
                <span>{theme === "dark" ? "浅色模式" : "深色模式"}</span>
              </div>
              <div className="sidebar-footer-item" onClick={onSettingsClick} role="button">
                <span>⚙️</span><span>设置</span>
              </div>
              <div className="sidebar-footer-item sidebar-footer-user">
                <div className="sidebar-user-avatar">
                  {userAvatar ? <img className="sidebar-user-avatar-img" src={userAvatar} alt="头像" /> : <span>👤</span>}
                </div>
                <span>{userDisplayName}</span>
              </div>
              <div className="sidebar-footer-item" onClick={onLogout} role="button">
                <span>🚪</span><span>退出登录</span>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
