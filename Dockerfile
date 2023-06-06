FROM denoland/deno:debian

WORKDIR /app

USER deno
ENV PRODUCTION true

COPY server.deno.ts index.txt tgbot.deno.ts .
COPY .well-known .well-known
COPY dl dl

CMD ["run", "--allow-all", "server.deno.ts"]
