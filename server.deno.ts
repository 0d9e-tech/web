const content = new TextDecoder().decode(await Deno.readFile("index.txt"));
const matrix_server = new TextDecoder().decode(await Deno.readFile("./.well-known/matrix/server"))
const matrix_client = new TextDecoder().decode(await Deno.readFile("./.well-known/matrix/client"))

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

  if (url.pathname === "/.well-known/matrix/server") {
    await e.respondWith(
      new Response(matrix_server, {
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
        },
      }),
    );
    return;
  }

  if (url.pathname === "/.well-known/matrix/client") {
    await e.respondWith(
      new Response(matrix_client, {
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
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
