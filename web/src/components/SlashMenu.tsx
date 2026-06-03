import { useState, useEffect, useMemo, useRef } from "react";
import { fetchApi } from "./AuthProvider";

export interface SlashItem {
  cmd: string;
  desc: string;
  kind: "builtin" | "skill";
  skillName?: string;
}

const BUILTINS: SlashItem[] = [
  { cmd: "/new", desc: "新建对话", kind: "builtin" },
  { cmd: "/clear", desc: "清空当前对话", kind: "builtin" },
  { cmd: "/export", desc: "导出对话为 Markdown", kind: "builtin" },
  { cmd: "/share", desc: "生成分享链接", kind: "builtin" },
];

export function SlashMenu({
  query,
  token,
  onSelect,
  onClose,
}: {
  query: string;
  token: string | null;
  onSelect: (item: SlashItem) => void;
  onClose: () => void;
}) {
  const [skills, setSkills] = useState<SlashItem[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Load skills once
  useEffect(() => {
    if (!token) return;
    fetchApi("/skills", {}, token)
      .then((d) => {
        const items: SlashItem[] = (d.skills as Array<{ name: string; description: string }>).map((s) => ({
          cmd: `/${s.name}`,
          desc: s.description || "Hermes 技能",
          kind: "skill" as const,
          skillName: s.name,
        }));
        setSkills(items);
      })
      .catch(() => {});
  }, [token]);

  const filtered = useMemo(() => {
    const q = query.replace(/^\//, "").toLowerCase();
    const all = [...BUILTINS, ...skills];
    if (!q) return all;
    return all.filter(
      (i) => i.cmd.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q),
    );
  }, [query, skills]);

  useEffect(() => { setActive(0); }, [query]);

  // Keyboard nav via window listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (filtered.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % filtered.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + filtered.length) % filtered.length); }
      else if (e.key === "Enter") { e.preventDefault(); onSelect(filtered[active]); }
      else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [filtered, active, onSelect, onClose]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (filtered.length === 0) return null;

  const builtins = filtered.filter((i) => i.kind === "builtin");
  const skillItems = filtered.filter((i) => i.kind === "skill");

  let idx = 0;
  const renderItem = (item: SlashItem) => {
    const myIdx = idx++;
    return (
      <div
        key={item.cmd}
        data-idx={myIdx}
        className={`slash-item ${myIdx === active ? "slash-item-active" : ""}`}
        onMouseEnter={() => setActive(myIdx)}
        onClick={() => onSelect(item)}
      >
        <span className="slash-cmd">{item.cmd}</span>
        <span className="slash-desc">{item.desc}</span>
      </div>
    );
  };

  return (
    <div className="slash-menu" ref={listRef}>
      {builtins.length > 0 && <div className="slash-group">快捷指令</div>}
      {builtins.map(renderItem)}
      {skillItems.length > 0 && <div className="slash-group">Hermes 技能</div>}
      {skillItems.map(renderItem)}
    </div>
  );
}
