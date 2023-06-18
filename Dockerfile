FROM denoland/deno:debian

WORKDIR /app

ENV PRODUCTION true
RUN apt update && apt install -y file procps pslist && rm -rf /var/lib/apt/lists/*

COPY server.deno.ts index.txt tgbot.deno.ts .
RUN deno cache server.deno.ts
COPY static static

CMD ["run", "--allow-all", "server.deno.ts"]
