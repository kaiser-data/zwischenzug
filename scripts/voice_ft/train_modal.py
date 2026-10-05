"""Fine-tune openai/whisper-tiny (MIT) on chess moves + command words, on Modal; export a whisper.cpp model.

    modal run scripts/voice_ft/train_modal.py --upload small --dry-run          # wave 0: CPU only, cents
    modal run scripts/voice_ft/train_modal.py --upload data --run tiny-a        # wave 1: one A10G run
    modal run scripts/voice_ft/train_modal.py --data data --run tiny-b --set lr=3e-5 --skip-existing

Data comes from make_dataset.py (~/.cache/zwischenzug/voice/ft/<name>/), is uploaded to the Modal volume
`zz-voice-ft`, and never enters the repo. One model serves EN and DE (Whisper's language token picks).
Each run writes runs/<run>/{ggml-model.bin, metrics.json, run.json} on the volume and downloads them to
~/.cache/zwischenzug/voice/ft/runs/<run>/. eval_local.py then scores it against the current model with
whisper-cli — the only number that decides a switch.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import modal

app = modal.App("zz-voice-ft")
vol = modal.Volume.from_name("zz-voice-ft", create_if_missing=True)
VOL = Path("/vol")
LOCAL = Path.home() / ".cache" / "zwischenzug" / "voice" / "ft"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install("torch==2.5.1", "transformers==4.46.3", "numpy<2", "huggingface_hub==0.26.2", "safetensors")
    # whisper.cpp's converter + the mel filters it reads from openai/whisper.
    .run_commands("git clone --depth 1 --branch v1.9.1 https://github.com/ggml-org/whisper.cpp /opt/whisper.cpp",
                  "git clone --depth 1 https://github.com/openai/whisper /opt/openai-whisper")
)

DEFAULTS = {"base": "openai/whisper-tiny", "lr": 5e-5, "steps": 2000, "batch": 64, "warmup": 0.08,
            "eval_every": 500, "real_weight": 8, "seed": 7}
A10G_PER_HOUR = 1.10
LANG_NAME = {"en": "english", "de": "german"}


def norm(text: str) -> str:
    if text.strip().startswith(("[", "(")):              # [BLANK_AUDIO], (noise): nothing heard
        return ""
    return " ".join(text.lower().replace(".", " ").replace(",", " ").replace("!", " ").replace("?", " ").split())


def augment(x, rng):
    """His phone or laptop mic in a room, not a TTS file: speed, level, noise, a duller mic, padding."""
    import numpy as np
    speed = rng.uniform(0.9, 1.12)
    x = np.interp(np.arange(0, len(x), speed), np.arange(len(x)), x).astype(np.float32)
    if rng.random() < 0.3:
        k = rng.integers(2, 5)
        x = np.convolve(x, np.ones(k) / k, mode="same").astype(np.float32)
    x = x / (np.abs(x).max() + 1e-6) * rng.uniform(0.15, 0.95)
    lead, trail = (np.zeros(int(16000 * rng.uniform(a, b)), np.float32) for a, b in ((0, 0.35), (0.05, 0.6)))
    x = np.concatenate([lead, x, trail])
    if rng.random() < 0.75:
        noise = rng.standard_normal(len(x)).astype(np.float32)
        if rng.random() < 0.5:                              # pinkish: room hum rather than hiss
            noise = np.cumsum(noise)
            noise -= np.convolve(noise, np.ones(400) / 400, mode="same")
        snr = rng.uniform(5, 35)
        p_sig = (x ** 2).mean() + 1e-9
        noise *= np.sqrt(p_sig / (10 ** (snr / 10)) / ((noise ** 2).mean() + 1e-9))
        x = x + noise.astype(np.float32)
    return np.clip(x, -1, 1)


class Clips:
    def __init__(self, folder: Path, split: str, train: bool, real_weight: int = 1):
        import numpy as np
        self.parts, self.index, self.train = [], [], train
        names = [split] + (["real"] if train and (folder / "real.npz").exists() else [])
        for name in names:
            z = np.load(folder / f"{name}.npz")
            rows = [json.loads(line) for line in (folder / f"manifest-{name}.jsonl").read_text().splitlines() if line]
            self.parts.append((z["audio"], z["offsets"], rows))
            reps = real_weight if name == "real" else 1      # his own voice counts several times
            self.index += [(len(self.parts) - 1, i) for i in range(len(rows))] * reps

    def __len__(self):
        return len(self.index)

    def __getitem__(self, k):
        import numpy as np
        p, i = self.index[k]
        audio, offsets, rows = self.parts[p]
        x = audio[offsets[i]:offsets[i + 1]].astype(np.float32) / 32768
        if self.train:
            x = augment(x, np.random.default_rng())
        return x, rows[i]


def collate(fe, toks):
    def run(batch):
        import torch
        feats = fe([x for x, _ in batch], sampling_rate=16000, return_tensors="pt").input_features
        # drop SOT: the model adds it. A noise clip's target is empty: just the end token.
        ids = [toks[r["lang"]](" " + r["text"] if r["text"] else "").input_ids[1:] for _, r in batch]
        n = max(map(len, ids))
        labels = torch.full((len(ids), n), -100, dtype=torch.long)
        for j, seq in enumerate(ids):
            labels[j, :len(seq)] = torch.tensor(seq)
        return feats, labels, [r for _, r in batch]
    return run


def evaluate(model, loader, toks, device, limit=None):
    import torch
    model.eval()
    by = {}
    examples = []
    with torch.no_grad():
        for b, (feats, _, rows) in enumerate(loader):
            if limit and b >= limit:
                break
            for lang in ("en", "de"):
                sel = [j for j, r in enumerate(rows) if r["lang"] == lang]
                if not sel:
                    continue
                out = model.generate(feats[sel].to(device, dtype=model.dtype), language=LANG_NAME[lang],
                                     task="transcribe", max_new_tokens=32)
                texts = toks[lang].batch_decode(out, skip_special_tokens=True)
                for j, t in zip(sel, texts):
                    r = rows[j]
                    ok = norm(t) == norm(r["text"])
                    key = f"{lang}/{r['kind']}"
                    by.setdefault(key, [0, 0])
                    by[key][0] += ok
                    by[key][1] += 1
                    if not ok and len(examples) < 40:
                        examples.append({"want": r["text"], "got": t.strip(), "voice": r["voice"]})
    model.train()
    acc = {k: round(v[0] / v[1], 4) for k, v in by.items()}
    total = sum(v[0] for v in by.values()) / max(1, sum(v[1] for v in by.values()))
    return {"acc": round(total, 4), "by": acc, "n": {k: v[1] for k, v in by.items()}, "misses": examples}


def export(model_dir: Path, base: str, out_dir: Path) -> Path:
    """HF folder → whisper.cpp ggml (f16). The tokenizer is unchanged, so its files come from the base."""
    import shutil
    import subprocess
    from huggingface_hub import hf_hub_download
    for f in ("vocab.json", "added_tokens.json"):
        shutil.copy(hf_hub_download(base, f), model_dir / f)
    subprocess.run(["python", "/opt/whisper.cpp/models/convert-h5-to-ggml.py", str(model_dir), "/opt/openai-whisper",
                    str(out_dir)], check=True, capture_output=True)
    return out_dir / "ggml-model.bin"


def _train(cfg: dict) -> dict:
    import numpy as np
    import torch
    from torch.utils.data import DataLoader
    from transformers import WhisperFeatureExtractor, WhisperForConditionalGeneration, WhisperTokenizer

    t0 = time.time()
    torch.manual_seed(cfg["seed"])
    np.random.seed(cfg["seed"])
    device = "cuda" if torch.cuda.is_available() else "cpu"
    data = VOL / "data" / cfg["data"]
    run_dir = VOL / "runs" / cfg["run"]
    run_dir.mkdir(parents=True, exist_ok=True)

    fe = WhisperFeatureExtractor.from_pretrained(cfg["base"])
    toks = {}
    for lang, name in LANG_NAME.items():
        toks[lang] = WhisperTokenizer.from_pretrained(cfg["base"])
        toks[lang].set_prefix_tokens(language=name, task="transcribe", predict_timestamps=False)
    model = WhisperForConditionalGeneration.from_pretrained(cfg["base"]).to(device)
    model.config.forced_decoder_ids = None
    model.generation_config.forced_decoder_ids = None

    train = Clips(data, "train", True, cfg["real_weight"])
    held = Clips(data, "eval", False)
    workers = 0 if cfg["dry_run"] else 8
    tl = DataLoader(train, batch_size=cfg["batch"], shuffle=True, num_workers=workers, collate_fn=collate(fe, toks),
                    drop_last=True, persistent_workers=workers > 0)
    el = DataLoader(held, batch_size=64, shuffle=False, num_workers=workers, collate_fn=collate(fe, toks))

    opt = torch.optim.AdamW(model.parameters(), lr=cfg["lr"], weight_decay=0.01)
    warm = max(1, int(cfg["steps"] * cfg["warmup"]))
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: min(1.0, (s + 1) / warm) * max(0.0, (cfg["steps"] - s) / max(1, cfg["steps"] - warm)))
    use_bf16 = device == "cuda"

    history, losses, best, step = [], [], -1.0, 0
    base_eval = evaluate(model, el, toks, device, limit=1 if cfg["dry_run"] else None)
    print("base model on held-out voices:", base_eval["acc"], base_eval["by"])
    while step < cfg["steps"]:
        for feats, labels, _ in tl:
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=use_bf16):
                loss = model(input_features=feats.to(device), labels=labels.to(device)).loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            opt.zero_grad(set_to_none=True)
            losses.append(loss.item())
            step += 1
            trail = sum(losses[-50:]) / len(losses[-50:])
            if step % 50 == 0 or cfg["dry_run"]:
                print(f"step {step} loss {trail:.4f} lr {sched.get_last_lr()[0]:.2e} {time.time() - t0:.0f}s")
            if not np.isfinite(trail):
                raise SystemExit(f"aborted at step {step}: loss is {trail}")
            if step % cfg["eval_every"] == 0 or step == cfg["steps"]:
                ev = evaluate(model, el, toks, device, limit=1 if cfg["dry_run"] else None)
                history.append({"step": step, "loss": round(trail, 4), **{k: ev[k] for k in ("acc", "by")}})
                print("eval", history[-1])
                if ev["acc"] > best:
                    best = ev["acc"]
                    model.save_pretrained(run_dir / "hf", safe_serialization=False)
                    (run_dir / "misses.json").write_text(json.dumps(ev["misses"], indent=1, ensure_ascii=False))
            if step >= cfg["steps"]:
                break

    ggml = export(run_dir / "hf", cfg["base"], run_dir)
    secs = time.time() - t0
    run = {"cfg": cfg, "seconds": round(secs), "device": device, "best_acc": best, "base_acc": base_eval["acc"],
           "cost_usd": round(secs / 3600 * A10G_PER_HOUR, 3) if device == "cuda" else 0.0,
           "ggml_mb": round(ggml.stat().st_size / 1e6, 1)}
    (run_dir / "metrics.json").write_text(json.dumps({"base": base_eval, "history": history}, indent=1, ensure_ascii=False))
    (run_dir / "run.json").write_text(json.dumps(run, indent=1))
    vol.commit()
    return run


@app.function(image=image, volumes={VOL: vol}, gpu="A10G", timeout=3 * 3600)
def train_gpu(cfg: dict) -> dict:
    return _train(cfg)


@app.function(image=image, volumes={VOL: vol}, cpu=4, memory=8192, timeout=1800)
def train_cpu(cfg: dict) -> dict:
    return _train(cfg)


@app.local_entrypoint()
def main(data: str = "small", run: str = "dry", upload: str = "", dry_run: bool = False, skip_existing: bool = False,
         set: str = ""):
    if upload:
        src = LOCAL / upload
        with vol.batch_upload(force=True) as b:
            for f in sorted(src.glob("*.npz")) + sorted(src.glob("manifest-*.jsonl")):
                b.put_file(f, f"/data/{upload}/{f.name}")
        print(f"uploaded {src} → zz-voice-ft:/data/{upload}")
        data = upload
    cfg = dict(DEFAULTS, data=data, run=run, dry_run=dry_run)
    for kv in filter(None, set.split(",")):
        k, v = kv.split("=")
        cfg[k] = type(DEFAULTS[k])(float(v)) if isinstance(DEFAULTS[k], (int, float)) else v
    if dry_run:
        cfg.update(steps=3, batch=4, eval_every=3)
    if skip_existing:
        try:
            done = json.loads(b"".join(vol.read_file(f"/runs/{run}/run.json")))
            print(f"{run} exists, skipped: {done}")
            return
        except Exception:  # noqa: BLE001 — not there yet
            pass
    out = (train_cpu if dry_run else train_gpu).remote(cfg)
    print(json.dumps(out, indent=1))
    dest = LOCAL / "runs" / run
    dest.mkdir(parents=True, exist_ok=True)
    for name in ("ggml-model.bin", "metrics.json", "run.json", "misses.json"):
        with (dest / name).open("wb") as f:
            for chunk in vol.read_file(f"/runs/{run}/{name}"):
                f.write(chunk)
    print(f"downloaded → {dest}")
