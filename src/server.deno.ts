// The authors disclaim copyright to this source code (they are ashamed to
// admit they wrote it)

import { serveDir } from "https://deno.land/std@0.190.0/http/file_server.ts";
import {
  get_video,
  getSticekr,
  getSticekrCount,
  handleTgWeb,
} from "./tg/bot.deno.ts";
import { init as tgBotInit } from "./tg/init.deno.ts";
import { webhookPath as tgWebhookPath } from "./tg/utils.deno.ts";
import { handleReplication, processTgUpdate } from "./replication.deno.ts";
import { RequestEvent } from "./utils.deno.ts";
import { webhookUrlToken } from "./tg/utils.deno.ts";

const indexContent = new TextDecoder().decode(
  await Deno.readFile("index.html"),
);
const indxContent = new TextDecoder().decode(await Deno.readFile("indx.html"));

async function handleHttp(request: Request): Promise<Response> {
  const start = performance.now();

  let resolve: (value: Response) => void;
  const responsePromise = new Promise<Response>((res) => {
    resolve = res;
  });

  const mockEvent: RequestEvent = {
    request,
    async respondWith(r) {
      const resp = await r;
      const end = performance.now();
      console.log(
        `${
          new Date().toISOString()
        } ${resp.status} ${request.method} ${request.url} ${
          (end - start).toFixed(1)
        }ms`,
      );
      resolve(resp);
    },
  };

  handleEvent(mockEvent)
    .then(async (response) => {
      if (response !== null) {
        await mockEvent.respondWith(response);
      }
    })
    .catch((err) => {
      console.error(err);
      mockEvent.respondWith(
        new Response("Internal Server Error", { status: 500 }),
      );
    });

  return await responsePromise;
}

async function handleEvent(e: RequestEvent): Promise<Response | null> {
  const url = new URL(e.request.url);
  if (url.pathname === tgWebhookPath) {
    if (
      e.request.method.toUpperCase() !== "POST" ||
      e.request.headers.get("X-Telegram-Bot-Api-Secret-Token") !==
        webhookUrlToken
    ) {
      return new Response("You shall not pass", {
        status: 401,
        headers: {
          "Content-Type": "text/plain",
        },
      });
    }

    const data = await e.request.json();

    await Promise.all([
      e.respondWith(
        new Response("processing", {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
          },
        }),
      ),
      processTgUpdate(data, 0),
    ]);
    return null;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    return Math.random() < 0.01
      ? new Response(indxContent, {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
        status: 418,
      })
      : new Response(indexContent, {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
  }

  if (url.pathname.startsWith("/replication/")) {
    return await handleReplication(e);
  }

  if (url.pathname === "/about") {
    return new Response("", {
      headers: {
        Location: "/lore",
      },
      status: 301,
    });
  }

  if (url.pathname === "/lore") {
    url.pathname = "/lore.jpg";
    e.request = new Request(url, e.request);
  }

  if (url.pathname.startsWith("/tgweb/")) {
    return await handleTgWeb(e);
  }

  if (url.pathname.startsWith("/api/videos/")) {
    const index = parseInt(url.pathname.split("/").pop()!);
    const videoBytes = get_video(index);

    if (videoBytes === null) {
      return new Response("Video not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    return new Response(videoBytes.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (url.pathname == "/api/stickers") {
    return new Response(`${await getSticekrCount()}`, {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname.startsWith("/api/stickers/")) {
    const index = parseInt(url.pathname.split("/").pop()!);
    const sticekrBytes = await getSticekr(index);

    if (sticekrBytes === null) {
      return new Response("Sticker not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    return new Response(sticekrBytes.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "image/webp",
      },
    });
  }

  const resp = await serveDir(e.request, { fsRoot: "static", quiet: true });

  if (![200, 301, 304].includes(resp.status)) {
    if (resp.status !== 404) console.error(resp);

    return new Response("Yo mama so fat she ate this page (404 Not Found)", {
      status: 404,
      headers: {
        "content-type": "text/plain",
      },
    });
  }

  if (url.pathname.startsWith("/.well-known/matrix/")) {
    resp.headers.set("Access-Control-Allow-Origin", "*");
    resp.headers.set("Content-Type", "application/json");
  }
  return resp;
}

///////// MAIN /////////

await tgBotInit();

Deno.serve({ port: parseInt(Deno.env.get("PORT") || "8000") }, handleHttp);
