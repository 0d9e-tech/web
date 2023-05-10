FROM denoland/deno:debian

WORKDIR /app

USER deno

COPY server.deno.ts index.txt .

CMD ["run", "--allow-all", "server.deno.ts"]
