import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/live" });

  wss.on("connection", async (clientWs: WebSocket, req) => {
    try {
      // Connect to Gemini Live
      const session = await ai.live.connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          // @ts-ignore
          outputAudioTranscription: {}, // Enable AI transcription
          // @ts-ignore
          inputAudioTranscription: {}, // Enable User transcription
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Aoede" }, // Natural voice
            },
          },
          systemInstruction:
            "You are a helpful, conversational AI assistant on a voice call with a human. Speak naturally, be concise, and adapt to the human's language and tone. You can speak Spanish and English.",
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio) {
              clientWs.send(JSON.stringify({ audio }));
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            // Transcription extraction based on structure (if available)
            // @ts-ignore
            const turnComplete = message.serverContent?.turnComplete;
            // @ts-ignore
            if (message.serverContent?.modelTurn?.parts) {
               // @ts-ignore
               const parts = message.serverContent.modelTurn.parts;
               for (const p of parts || []) {
                  if (p.text) {
                     clientWs.send(JSON.stringify({ transcription: { role: "ai", text: p.text } }));
                  }
               }
            }
          },
          onclose: () => {
            clientWs.close();
          },
          onerror: (error) => {
            console.error("Gemini Live Error:", error);
            clientWs.send(JSON.stringify({ error: "Gemini connection error" }));
          }
        },
      });

      clientWs.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.audio) {
            session.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" },
            });
          }
          if (parsed.end) {
             clientWs.close();
          }
        } catch (err) {
          console.error("Error parsing message from client:", err);
        }
      });

      clientWs.on("close", () => {
        // Just let it close or we can handle cleanup if needed.
        // It's possible the user ends the call
      });
    } catch (err) {
      console.error("Failed to start Gemini session:", err);
      clientWs.send(JSON.stringify({ error: "Failed to connect to AI" }));
      clientWs.close();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
