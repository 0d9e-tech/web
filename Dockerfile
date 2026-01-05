FROM jekyll/jekyll AS blog-builder

COPY blog/ ./

RUN bundle install
RUN bundle exec jekyll build -d build/

FROM denoland/deno:debian

WORKDIR /app

RUN mkdir -p /usr/share/fonts/truetype/inconsolata
COPY stuff/Inconsolata-Bold.otf /usr/share/fonts/truetype/inconsolata

RUN apt update && apt install -y file procps figlet fortune cowsay pslist inkscape imagemagick --no-install-recommends && rm -rf /var/lib/apt/lists/*

COPY ind*x.html ./
COPY src src
RUN deno cache src/server.deno.ts
COPY static static
COPY --from=blog-builder /srv/jekyll/build/ ./static/blog

ENV PATH="$PATH:/usr/games"
COPY ./static/amogus.cow /usr/share/cowsay/cows

ARG ACTOR
RUN sed -i "s|<BUILD_ACTOR>|${ACTOR}|g" src/tg/init.deno.ts

CMD ["sh", "-c", "deno run --unstable-cron --allow-all src/server.deno.ts 2>&1 | sed -u -e \"s/$TG_BOT_TOKEN/<REDACTED>/g\" >> static/persistent/log.txt"]
