import { serveDir } from "https://deno.land/std@0.190.0/http/file_server.ts";
import {
  handleRequest as handleTgRequest,
  handleTgWeb,
  init as tgBotInit,
  webhookPath as tgWebhookPath,
} from "./tgbot.deno.ts";

const indexContent = new TextDecoder().decode(
  await Deno.readFile("index.html")
);

async function handleHttp(conn: Deno.Conn) {
  for await (const e of Deno.serveHttp(conn)) {
    const start = performance.now();

    const mockEvent: Deno.RequestEvent = {
      request: e.request,
      async respondWith(r) {
        const resp = await r;
        const end = performance.now();
        console.log(
          `${new Date().toISOString()} ${resp.status} ${e.request.method} ${
            e.request.url
          } ${(end - start).toFixed(1)}ms`
        );
        return await e.respondWith(resp);
      },
    };

    handleEvent(mockEvent)
      .then(async (response) => {
        if (response !== null) {
          await mockEvent.respondWith(response);
        }
      })
      .catch((err) => console.error(err));
  }
}

async function handleEvent(e: Deno.RequestEvent): Promise<Response | null> {
  const url = new URL(e.request.url);
  if (url.pathname === tgWebhookPath) {
    await handleTgRequest(e);
    return null;
  }
  if (Math.random() < 0.001)
    return new Response("Yo mama so fat she became a teapot", { status: 418 });

  if (url.pathname === "/" || url.pathname === "/index.html")
    return new Response(indexContent, {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });

  if (url.pathname === "/about")
    return new Response("", {
      headers: {
        Location: "/lore",
      },
      status: 301,
    });

  if (url.pathname === "/lore") {
    url.pathname = "/lore.jpg";
    e.request = new Request(url, e.request);
  }

  if (url.pathname.startsWith("/tgweb/")) {
    return await handleTgWeb(e);
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

for await (const conn of Deno.listen({ port: 8000 }))
  handleHttp(conn).catch((err) => console.error(err));
