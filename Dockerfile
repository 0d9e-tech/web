FROM jekyll/jekyll AS blog-builder

COPY blog/ ./

RUN bundle install
RUN bundle exec jekyll build -d build/

FROM denoland/deno:debian

WORKDIR /app

RUN mkdir -p /usr/share/fonts/truetype/inconsolata
COPY stuff/Inconsolata-Bold.otf /usr/share/fonts/truetype/inconsolata

RUN apt update && apt install -y file procps figlet fortune cowsay pslist inkscape --no-install-recommends && rm -rf /var/lib/apt/lists/*

COPY server.deno.ts index.txt tgbot.deno.ts ./
RUN deno cache server.deno.ts
COPY static static
COPY --from=blog-builder /srv/jekyll/build/ ./static/blog

CMD ["run", "--allow-all", "server.deno.ts"]
