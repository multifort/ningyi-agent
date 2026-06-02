import { useState, useRef } from "react";

export interface SettingsData {
  avatar: string | null;
  displayName: string;
  systemPrompt: string;
  apiKey: string;
  fontSize: number;
}

interface SettingsProps {
  settings: SettingsData;
  onSave: (data: SettingsData) => void;
  onClose: () => void;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const AVATAR_SIZE = 128;

export function Settings({ settings, onSave, onClose }: SettingsProps) {
  const [avatar, setAvatar] = useState<string | null>(settings.avatar);
  const [displayName, setDisplayName] = useState(settings.displayName);
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt || "");
  const [apiKey, setApiKey] = useState(settings.apiKey || "");
  const [error, setError] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError("");
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("仅支持 PNG、JPEG、WebP 格式");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("图片大小不能超过 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        const maxDim = 256;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        setAvatar(canvas.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onSave({
      avatar,
      displayName: displayName.trim() || "multifort",
      systemPrompt: systemPrompt.trim(),
      apiKey: apiKey.trim(),
      fontSize: settings.fontSize || 16,
    });
    onClose();
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {/* Avatar */}
        <div className="settings-section">
          <label className="settings-label">头像</label>
          <div className="settings-avatar-area">
            <div className="settings-avatar-preview">
              {avatar ? (
                <img className="settings-avatar-img" src={avatar} alt="头像"
                  style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }} />
              ) : (
                <div className="settings-avatar-placeholder"
                  style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>👤</div>
              )}
            </div>
            <div className="settings-avatar-actions">
              <button className="btn-settings" onClick={() => fileRef.current?.click()}>
                {avatar ? "更换图片" : "上传图片"}
              </button>
              {avatar && (
                <button className="btn-settings btn-settings-danger" onClick={() => setAvatar(null)}>
                  移除
                </button>
              )}
              <span className="settings-hint">支持 PNG / JPEG / WebP，最大 2MB</span>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange} style={{ display: "none" }} />
          </div>
          {error && <div className="settings-error">{error}</div>}
        </div>

        {/* Display Name */}
        <div className="settings-section">
          <label className="settings-label">显示名称</label>
          <input className="settings-input" type="text" value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="输入显示名称" maxLength={20} />
        </div>

        {/* System Prompt */}
        <div className="settings-section">
          <label className="settings-label">系统提示词</label>
          <textarea className="settings-textarea" value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="自定义 AI 的角色和回复风格，留空使用默认提示词"
            rows={4} maxLength={2000} />
          <span className="settings-hint">
            {systemPrompt.length}/2000 字符
          </span>
        </div>

        {/* API Key */}
        <div className="settings-section">
          <label className="settings-label">API Key</label>
          <div className="settings-apikey-row">
            <input className="settings-input" type={showApiKey ? "text" : "password"}
              value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              placeholder="输入你的 DeepSeek API Key（可选）" />
            <button className="btn-settings" onClick={() => setShowApiKey(!showApiKey)}>
              {showApiKey ? "🙈" : "👁️"}
            </button>
          </div>
          <span className="settings-hint">
            留空则使用系统默认 Key。密钥仅保存在本地浏览器。
          </span>
        </div>

        <div className="settings-footer">
          <button className="btn-settings-primary" onClick={handleSave}>保存</button>
          <button className="btn-settings" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
