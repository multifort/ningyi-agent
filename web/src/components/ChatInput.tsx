import { useState, useRef, useCallback, useEffect } from "react";

const TOOLS = [
  { label: "翻译", text: "请将以下内容翻译成英文：" },
  { label: "编程", text: "请用代码解决以下问题，并附上解释：" },
  { label: "总结", text: "请总结以下内容的核心要点：" },
  { label: "润色", text: "请润色以下文字，使其更加流畅专业：" },
];

export function ChatInput({
  onSend,
  onStop,
  streaming,
  editText,
  onEditConsumed,
  searchEnabled,
  onToggleSearch,
  canContinue,
  onContinue,
  agentMode,
  onToggleAgentMode,
}: {
  onSend: (text: string, fileContent?: string) => void;
  onStop: () => void;
  streaming: boolean;
  editText: string;
  onEditConsumed: () => void;
  searchEnabled: boolean;
  onToggleSearch: () => void;
  canContinue: boolean;
  onContinue: () => void;
  agentMode: boolean;
  onToggleAgentMode: () => void;
}) {
  const [input, setInput] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [listening, setListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editText) {
      setInput(editText);
      setTimeout(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          ta.selectionStart = ta.selectionEnd = ta.value.length;
        }
      }, 0);
      onEditConsumed();
    }
  }, [editText, onEditConsumed]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  // Show commands when typing /
  useEffect(() => {
    setShowCommands(input.startsWith("/") && input.length <= 10);
  }, [input]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || streaming) return;
    onSend(text, fileContent || undefined);
    setInput("");
    setFileName("");
    setFileContent("");
  }, [input, streaming, onSend, fileContent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !showCommands) {
      e.preventDefault();
      streaming ? onStop() : handleSend();
    }
    if (e.key === "Escape") setShowCommands(false);
  };

  const execCommand = (cmd: string) => {
    setInput("");
    setShowCommands(false);
    if (cmd === "/clear") onSend("请忽略对话历史，开始新话题。", undefined);
  };

  const toggleVoice = () => {
    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("浏览器不支持语音输入"); return; }
    if (listening) { setListening(false); return; }

    const recognition = new (SpeechRecognition as any)();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setInput((prev) => prev + text);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("文件不能超过 5MB"); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setFileContent(`[用户上传文件: ${file.name}]\n内容:\n${(reader.result as string).slice(0, 8000)}`);
    };
    reader.readAsText(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        e.preventDefault();
        const blob = items[i].getAsFile();
        if (!blob) continue;
        if (blob.size > 5 * 1024 * 1024) { alert("图片不能超过 5MB"); continue; }
        const reader = new FileReader();
        reader.onload = () => {
          setFileName("粘贴的图片");
          setFileContent(`[用户粘贴图片: data:image/png;base64,${(reader.result as string).split(",")[1]?.slice(0, 500)}]`);
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  };

  return (
    <div className="chat-input-area">
      <div className="chat-input-box">
        {showCommands && (
          <div className="commands-dropdown">
            <div className="command-item" onClick={() => execCommand("/clear")}>
              <span className="command-cmd">/clear</span>
              <span className="command-desc">清除对话上下文</span>
            </div>
          </div>
        )}
        {fileName && (
          <div className="file-attachment">📎 {fileName}
            <button className="file-remove" onClick={() => { setFileName(""); setFileContent(""); if (fileRef.current) fileRef.current.value = ""; }}>✕</button>
          </div>
        )}
        <textarea ref={textareaRef} className="chat-input" value={input}
          onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste}
          placeholder={fileName ? `将基于 "${fileName}" 的内容回答…` : "输入消息… (/ 查看指令)"} rows={1} />
        <div className="chat-toolbar">
          <div className="toolbar-left">
            <select className="tool-select" value="" onChange={(e) => { if (e.target.value) setInput(e.target.value); e.target.value = ""; }}>
              <option value="">工具</option>
              {TOOLS.map(t => <option key={t.label} value={t.text}>{t.label}</option>)}
            </select>
            <button className="btn-tool" onClick={() => fileRef.current?.click()} title="上传附件">📎</button>
            <button className={`btn-tool ${listening ? "btn-tool-active" : ""}`} onClick={toggleVoice} title="语音输入">
              {listening ? "🎙️" : "🎤"}
            </button>
            <button className={`btn-tool ${searchEnabled ? "btn-tool-active" : ""}`} onClick={onToggleSearch}
              title={searchEnabled ? "关闭联网搜索" : "开启联网搜索"}>🌐</button>
            <button
              className={`btn-tool btn-mode-toggle ${agentMode ? "btn-tool-active" : ""}`}
              onClick={onToggleAgentMode}
              title={agentMode ? "当前：Agent 模式（点击切换为 Chat 模式）" : "当前：Chat 模式（点击切换为 Agent 模式）"}
              style={{ fontWeight: agentMode ? 700 : 400 }}
            >
              {agentMode ? "⚡ Agent" : "💬 Chat"}
            </button>
          </div>
          <div className="toolbar-right">
            {canContinue && !streaming && (
              <button className="btn-tool btn-tool-continue" onClick={onContinue} title="继续生成">▶ 继续</button>
            )}
            {streaming ? <button className="btn-tool btn-tool-stop" onClick={onStop}>⏹ 停止</button>
              : <button className="btn-tool btn-tool-send" onClick={handleSend} disabled={!input.trim()}>↑</button>}
          </div>
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".txt,.md,.json,.csv,.py,.js,.ts,.tsx,.html,.css,.pdf" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}
