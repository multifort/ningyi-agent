import { useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthProvider";
import { useTheme } from "./ThemeProvider";
import logoImg from "/logo.png";
import bgImg from "/login_bg.png";
import "../Auth.css";

/* ── Particle background ─────────────────────── */

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let animId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    interface Particle {
      x: number; y: number; vx: number; vy: number;
      r: number; alpha: number; da: number;
    }

    const particles: Particle[] = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: Math.random() * 2 + 1,
      alpha: Math.random() * 0.6 + 0.2,
      da: (Math.random() - 0.5) * 0.008,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha += p.da;
        if (p.alpha <= 0.1 || p.alpha >= 0.8) p.da *= -1;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
        ctx.fill();

        // Light mode: dark particles
        if (document.documentElement.getAttribute("data-theme") === "light") {
          ctx.fillStyle = `rgba(50,50,100,${p.alpha * 0.6})`;
          ctx.fill();
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="particle-canvas" />;
}

/* ── Wave SVG ────────────────────────────────── */

function Waves() {
  return (
    <div className="waves">
      <svg viewBox="0 0 1440 120" preserveAspectRatio="none">
        <path
          className="wave wave-1"
          d="M0,60 C240,100 480,20 720,60 C960,100 1200,20 1440,60 L1440,120 L0,120 Z"
        />
        <path
          className="wave wave-2"
          d="M0,80 C240,40 480,100 720,80 C960,60 1200,100 1440,80 L1440,120 L0,120 Z"
        />
        <path
          className="wave wave-3"
          d="M0,90 C240,60 480,110 720,90 C960,70 1200,100 1440,90 L1440,120 L0,120 Z"
        />
      </svg>
    </div>
  );
}

/* ── Login Page ──────────────────────────────── */

export function LoginPage({
  onSwitchRegister,
}: {
  onSwitchRegister: () => void;
}) {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError("");
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" style={{ backgroundImage: `url(${bgImg})` }} />
      <ParticleCanvas />
      <Waves />

      <div className="auth-card animate-in">
        <div className="auth-logo">
          <img src={logoImg} alt="宁翼智能助手" />
        </div>
        <h1 className="auth-title">宁翼智能助手</h1>
        <p className="auth-subtitle">欢迎回来</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <span className="auth-field-icon">👤</span>
            <input
              className="auth-input"
              type="text"
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div
            className="auth-field"
            onMouseEnter={() => setShowPwd(true)}
            onMouseLeave={() => setShowPwd(false)}
          >
            <span className="auth-field-icon">🔒</span>
            <input
              className="auth-input"
              type={showPwd ? "text" : "password"}
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="auth-pwd-toggle">
              {showPwd ? "🙈" : "👁️"}
            </span>
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button
            className="auth-btn"
            type="submit"
            disabled={submitting || !username.trim() || !password}
          >
            {submitting ? "登录中…" : "登 录"}
          </button>
        </form>

        <p className="auth-switch">
          还没有账号？{" "}
          <button className="auth-link" onClick={onSwitchRegister}>
            立即注册
          </button>
        </p>
      </div>

      <button
        className="auth-theme-toggle"
        onClick={toggleTheme}
        title={theme === "dark" ? "切换浅色" : "切换深色"}
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>
    </div>
  );
}

/* ── Register Page ───────────────────────────── */

export function RegisterPage({
  onSwitchLogin,
}: {
  onSwitchLogin: () => void;
}) {
  const { register } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    if (password !== confirm) {
      setError("两次密码不一致");
      return;
    }
    if (password.length < 6) {
      setError("密码至少6位");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await register(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" style={{ backgroundImage: `url(${bgImg})` }} />
      <ParticleCanvas />
      <Waves />

      <div className="auth-card animate-in">
        <div className="auth-logo">
          <img src={logoImg} alt="宁翼智能助手" />
        </div>
        <h1 className="auth-title">宁翼智能助手</h1>
        <p className="auth-subtitle">创建新账号</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <span className="auth-field-icon">👤</span>
            <input
              className="auth-input"
              type="text"
              placeholder="用户名（3-30位字母数字下划线）"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div
            className="auth-field"
            onMouseEnter={() => setShowPwd(true)}
            onMouseLeave={() => setShowPwd(false)}
          >
            <span className="auth-field-icon">🔒</span>
            <input
              className="auth-input"
              type={showPwd ? "text" : "password"}
              placeholder="密码（至少6位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="auth-pwd-toggle">
              {showPwd ? "🙈" : "👁️"}
            </span>
          </div>
          <div
            className="auth-field"
            onMouseEnter={() => setShowPwd(true)}
            onMouseLeave={() => setShowPwd(false)}
          >
            <span className="auth-field-icon">🔒</span>
            <input
              className="auth-input"
              type={showPwd ? "text" : "password"}
              placeholder="确认密码"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <span className="auth-pwd-toggle">
              {showPwd ? "🙈" : "👁️"}
            </span>
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button
            className="auth-btn"
            type="submit"
            disabled={
              submitting || !username.trim() || !password || !confirm
            }
          >
            {submitting ? "注册中…" : "注 册"}
          </button>
        </form>

        <p className="auth-switch">
          已有账号？{" "}
          <button className="auth-link" onClick={onSwitchLogin}>
            去登录
          </button>
        </p>
      </div>

      <button
        className="auth-theme-toggle"
        onClick={toggleTheme}
        title={theme === "dark" ? "切换浅色" : "切换深色"}
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>
    </div>
  );
}
