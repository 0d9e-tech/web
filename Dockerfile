FROM denoland/deno:debian

WORKDIR /app

USER deno

COPY server.deno.ts index.txt .
COPY .well-known .well-known

CMD ["run", "--allow-all", "server.deno.ts"]
