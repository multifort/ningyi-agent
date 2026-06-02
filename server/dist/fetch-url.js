/**
 * URL fetch — fetch web page content for injection into chat.
 */
import { Router } from "express";
import { authMiddleware } from "./middleware/auth.js";
const router = Router();
router.use(authMiddleware);
router.post("/fetch-url", async (req, res) => {
    const { url } = req.body ?? {};
    if (!url || typeof url !== "string") {
        res.status(400).json({ message: "请提供 URL" });
        return;
    }
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok)
            throw new Error(`HTTP ${resp.status}`);
        const html = await resp.text();
        // Simple text extraction: strip tags, normalize whitespace
        const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 8000);
        res.json({ url, content: text });
    }
    catch (e) {
        res.status(500).json({ message: `无法获取 URL: ${e instanceof Error ? e.message : "未知错误"}` });
    }
});
export default router;
//# sourceMappingURL=fetch-url.js.map