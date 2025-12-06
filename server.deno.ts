// The authors disclaim copyright to this source code (they are ashamed to
// admit they wrote it)

import { serveDir } from "https://deno.land/std@0.190.0/http/file_server.ts";
import {
  handleRequest as handleTgRequest,
  handleTgWeb,
  get_video,
  RequestEvent,
  init as tgBotInit,
  webhookPath as tgWebhookPath,
} from "./tgbot.deno.ts";

const indexContent = new TextDecoder().decode(
  await Deno.readFile("index.html")
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
        `${new Date().toISOString()} ${resp.status} ${request.method} ${
          request.url
        } ${(end - start).toFixed(1)}ms`
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
    .catch((err) => console.error(err));

  return await responsePromise;
}

async function handleEvent(e: RequestEvent): Promise<Response | null> {
  const url = new URL(e.request.url);
  if (url.pathname === tgWebhookPath) {
    await handleTgRequest(e);
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
    const index = parseInt(url.pathname.split('/').pop()!);
    const videoBytes = get_video(index);

    if (videoBytes === null) {
      return new Response("Video not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    return new Response(videoBytes, {
      headers: {
        "Content-Type": "video/mp4",
        "Access-Control-Allow-Origin": "*"
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

Deno.serve({ port: 8000 }, handleHttp);
