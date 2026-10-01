# Build context = repo root:  railway up  (railway.toml points here)
FROM python:3.12-slim AS whisper
RUN apt-get update && apt-get install -y --no-install-recommends git build-essential cmake ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch v1.9.1 https://github.com/ggml-org/whisper.cpp /src \
 && cmake -S /src -B /src/build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF \
          -DWHISPER_BUILD_EXAMPLES=ON -DGGML_NATIVE=OFF \
 && cmake --build /src/build -j --target whisper-cli

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg stockfish \
 && rm -rf /var/lib/apt/lists/*
COPY --from=whisper /src/build/bin/whisper-cli /usr/local/bin/whisper-cli
WORKDIR /app
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt
COPY server/ server/
# The chess speech models (CC BY-NC-SA) are fetched onto the volume at first use, never baked in.
ENV ZZ_DATA=/data ZZ_VOICE_DIR=/data/voice STOCKFISH=/usr/games/stockfish WHISPER_CLI=/usr/local/bin/whisper-cli
CMD ["sh", "-c", "uvicorn server.app:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'"]
