import "dotenv/config";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tasksHandler from "./api/tasks.ts";
import remindersHandler from "./api/reminders.ts";
import settingsHandler from "./api/settings.ts";
import sendWhatsappHandler from "./api/send-whatsapp.ts";
import notesHandler from "./api/notes.ts";
import mediaHandler from "./api/media.ts";

function localApiPlugin(): Plugin {
  return {
    name: "gustavo-local-vercel-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || "").split("?")[0];
        if (pathname === "/api/tasks") {
          await tasksHandler(req, res);
          return;
        }
        if (pathname === "/api/reminders") {
          await remindersHandler(req, res);
          return;
        }
        if (pathname === "/api/settings") {
          await settingsHandler(req, res);
          return;
        }
        if (pathname === "/api/send-whatsapp") {
          await sendWhatsappHandler(req, res);
          return;
        }
        if (pathname === "/api/notes") {
          await notesHandler(req, res);
          return;
        }
        if (pathname === "/api/media") {
          await mediaHandler(req, res);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
