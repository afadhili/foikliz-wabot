FROM debian:bookworm-slim AS whisper-build
ARG WHISPER_CPP_REF=482279b8a18855ba741d7b88c30fcb3874691f59

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    cmake \
    curl \
    git \
    build-essential \
 && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/ggml-org/whisper.cpp.git /src/whisper.cpp \
 && git -C /src/whisper.cpp checkout "$WHISPER_CPP_REF" \
 && cmake -S /src/whisper.cpp -B /src/whisper.cpp/build -DCMAKE_BUILD_TYPE=Release \
 && cmake --build /src/whisper.cpp/build --config Release --target whisper-cli -j2 \
 && sh /src/whisper.cpp/models/download-ggml-model.sh base

FROM oven/bun:1 AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    libgomp1 \
    python3 \
    python3-venv \
 && python3 -m venv /opt/yt-dlp \
 && /opt/yt-dlp/bin/pip install --no-cache-dir yt-dlp \
 && rm -rf /var/lib/apt/lists/*

COPY --from=whisper-build /src/whisper.cpp/build/bin/ /opt/whisper/build/bin/
COPY --from=whisper-build /src/whisper.cpp/models/ggml-base.bin /opt/whisper/models/ggml-base.bin

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src

ENV NODE_ENV=production \
    YTDLP_PATH=/opt/yt-dlp/bin/yt-dlp \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    WHISPER_CPP_PATH=/opt/whisper/build/bin/whisper-cli \
    WHISPER_MODEL_PATH=/opt/whisper/models/ggml-base.bin \
    WHISPER_THREADS=4

CMD ["bun", "run", "start"]
