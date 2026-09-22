import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Multilingual AI Agent Endpoint
app.post("/api/ai/chat", async (req, res) => {
  const { message, language = "en", screenContext = "posts", history = [] } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const ai = getGeminiClient();

    if (ai) {
      try {
        const systemInstruction = `You are "Aura", an embedded, screen-aware multilingual digital assistant for "Social App v.30.7" (a cutting-edge cross-platform mobile community with native OTP, blank feeds, swipeable reels, and instant messaging).
The user is currently viewing the "${screenContext}" screen.
Your job is to assist users in whatever language they ask in (detect automatically or follow target language: ${language}).
Keep responses friendly, helpful, culturally authentic, and formatted with clean markdown when relevant.
Write response cards cleanly and concisely for mobile screens. You can answer questions, translate text, craft creative social posts, generate hashtags, summarize chats, or provide helpful tips for social content creators tailored to the active screen context.`;

        const contents = [
          ...history.slice(-6).map((h: { sender: string; text: string }) => ({
            role: h.sender === "user" ? "user" : "model",
            parts: [{ text: h.text }],
          })),
          {
            role: "user",
            parts: [{ text: message }],
          },
        ];

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });

        if (response.text) {
          return res.json({
            reply: response.text,
            detectedLanguage: language,
          });
        }
      } catch (geminiErr) {
        console.warn("Gemini API call failed, falling back to local multilingual generator:", geminiErr);
      }
    }

    // Built-in intelligent multilingual fallback when GEMINI_API_KEY is not configured
    const lower = message.toLowerCase();
    let reply = "";

    if (language === "ar" || /[\u0600-\u06FF]/.test(message)) {
      reply = `أهلاً بك! أنا "أورا"، المساعد الذكي لتطبيق Social App. ${
        lower.includes("بوست") || lower.includes("منشور")
          ? "يمكنك الضغط على زر (+ منشور جديد) لمشاركة أفكارك وصورك مع المجتمع في شاشة المنشورات!"
          : lower.includes("ريلز") || lower.includes("فيديو")
          ? "في تبويب الريلز، يمكنك السحب للأعلى والأسفل لاستكشاف مقاطع الفيديو القصيرة أو الضغط على (+ إنشاء ريلز)!"
          : lower.includes("مرحبا") || lower.includes("أهلا")
          ? "مرحباً بك في Social App! كيف يمكنني مساعدتك اليوم في تصفح المنشورات أو الدردشة أو إعدادات الحساب؟"
          : "شكراً لرسالتك! أنا مستعد لمساعدتك في صياغة المنشورات، ترجمة النصوص، وإدارة مجتمعك بكل سلاسة."
      }`;
    } else if (language === "es" || lower.includes("hola") || lower.includes("gracias")) {
      reply = `¡Hola! Soy Aura, tu asistente virtual en Social App. Puedo ayudarte a redactar publicaciones cautivadoras, explorar Reels y gestionar tus chats instantáneos con estilo neón (#00F2FE & #FF007F).`;
    } else if (language === "fr" || lower.includes("bonjour") || lower.includes("merci")) {
      reply = `Bonjour ! Je suis Aura, votre assistante IA pour Social App. Que souhaitez-vous créer aujourd'hui ? Un nouveau post, une vidéo Reel ou discuter avec vos amis ?`;
    } else if (language === "ja" || /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(message)) {
      reply = `こんにちは！「Social App」のAIアシスタント「Aura」です。投稿の作成、リールの探索、友達とのチャットなど、何でもお手伝いします！`;
    } else {
      if (lower.includes("post") || lower.includes("feed")) {
        reply = `To share content, tap the **+ Add Post** button at the top of the feed! You can upload an image or choose one of our trending aesthetics, write a caption, and it instantly syncs to your feed.`;
      } else if (lower.includes("reel") || lower.includes("video")) {
        reply = `In the **Reels** tab, swipe vertically to browse creator videos. Use **+ Create Reel** to capture or simulate camera roll uploads with custom sound tracks!`;
      } else if (lower.includes("otp") || lower.includes("auth") || lower.includes("verify")) {
        reply = `Our Native Authentication uses a secure 6-digit OTP engine simulated with local background push notifications. Tap the banner or notification to quickly paste and verify your code!`;
      } else if (lower.includes("arabic") || lower.includes("rtl") || lower.includes("language")) {
        reply = `Head to **Settings** and toggle the Global Language Switcher! Selecting Arabic instantly flips the entire interface to native RTL (Right-to-Left) with bidirectional layout adjustments.`;
      } else {
        reply = `Hello! I'm Aura, your multilingual AI companion in Social App. I can help you craft viral captions, generate trending hashtags, translate phrases, or navigate our feeds, reels, and instant messaging. What would you like to explore?`;
      }
    }

    return res.json({ reply, detectedLanguage: language });
  } catch (error: any) {
    console.error("AI error:", error);
    return res.status(500).json({
      error: "Failed to generate AI response",
      fallback: "Aura is currently refreshing. Please try again shortly!",
    });
  }
});

// App health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  server.on("error", (err: any) => {
    console.error("Server listen error:", err);
  });

  process.on("SIGTERM", () => {
    server.close(() => {
      console.log("Server stopped on SIGTERM");
      process.exit(0);
    });
  });

  process.on("SIGINT", () => {
    server.close(() => {
      console.log("Server stopped on SIGINT");
      process.exit(0);
    });
  });
}

startServer();
