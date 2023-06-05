FROM denoland/deno:debian

WORKDIR /app

USER deno

COPY server.deno.ts index.txt tgbot.deno.ts .
COPY .well-known .well-known
COPY dl dl

CMD ["run", "--allow-all", "server.deno.ts"]
