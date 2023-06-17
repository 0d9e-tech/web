import { serveDir } from "https://deno.land/std@0.190.0/http/file_server.ts";
import {
  handleRequest as handleTgRequest,
  handleTgWeb,
  init as tgBotInit,
  webhookPath as tgWebhookPath,
} from "./tgbot.deno.ts";

const indexContent = new TextDecoder().decode(await Deno.readFile("index.txt"));

async function handleHttp(conn: Deno.Conn) {
  for await (const e of Deno.serveHttp(conn)) {
    handleEvent(e)
      .then(async (response) => {
        if (response !== null) {
          await e.respondWith(response);
        }
      })
      .catch((err) => console.error(err));
  }
}

async function handleEvent(e: Deno.RequestEvent): Promise<Response | null> {
  const url = new URL(e.request.url);
  if (url.pathname === "/" || url.pathname === "/index.txt")
    return new Response(indexContent, {
      headers: {
        "content-type": "text/plain",
      },
    });

  if (url.pathname === "/index.html")
    return new Response("<p>Text only, go to <a href='/'>/</a></p>", {
      headers: {
        "content-type": "text/html",
        location: "/",
      },
      status: 302,
    });

  if (url.pathname === tgWebhookPath) {
    await handleTgRequest(e);
    return null;
  }

  if (url.pathname.startsWith("/tgweb/")) {
    return await handleTgWeb(e);
  }

  const resp = await serveDir(e.request, { fsRoot: "static" });
  if (resp.status !== 200)
    return new Response("Yo mama so fat she ate this page (404 Not Found)", {
      status: 404,
      headers: {
        "content-type": "text/plain",
      },
    });

  if (url.pathname.startsWith("/.well-known/matrix/")) {
    resp.headers.set("Access-Control-Allow-Origin", "*");
    resp.headers.set("Content-Type", "application/json");
  }
  return resp;
}

///////// MAIN /////////

if (Deno.env.get("PRODUCTION") === "true") await tgBotInit();

for await (const conn of Deno.listen({ port: 8000 }))
  handleHttp(conn).catch((err) => console.error(err));
