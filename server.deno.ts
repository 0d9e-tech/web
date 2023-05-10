const content = new TextDecoder().decode(await Deno.readFile("index.txt"));

async function handleHttp(conn: Deno.Conn) {
  for await (const e of Deno.serveHttp(conn)) {
    handleEvent(e);
  }
}

for await (const conn of Deno.listen({ port: 8000 })) {
  handleHttp(conn);
}

async function handleEvent(e: Deno.RequestEvent) {
  const url = new URL(e.request.url);
  if (url.pathname === "/" || url.pathname === "/index.txt") {
    await e.respondWith(
      new Response(content, {
        headers: {
          "content-type": "text/plain",
        },
      }),
    );
    return;
  }

  await e.respondWith(
    new Response("Not found", {
      status: 404,
      headers: {
        "content-type": "text/plain",
      },
    }),
  );
}
