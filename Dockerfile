FROM denoland/deno:debian

WORKDIR /app

ENV PRODUCTION true
# inconsolata for the logo generator
RUN apt update && apt install -y file procps pslist fonts-inconsolata && rm -rf /var/lib/apt/lists/*

COPY server.deno.ts index.txt tgbot.deno.ts .
RUN deno cache server.deno.ts
COPY static static
COPY logo.svg .

CMD ["run", "--allow-all", "server.deno.ts"]
