# MLX Curator runbook — Phase 1 (Mac Studio)

**What this is, in plain language:** the Curator learns *your* taste. You show
it renders you kept vs ones you passed on, and it learns to spot more keepers
— then ranks a fresh batch so the good stuff floats to the top. Phase 1 is just
proving that loop works. The embedding step (turning each PNG into a list of
numbers the taste model can read) now runs on **Apple MLX** with a SigLIP
vision model, instead of PyTorch. Same commands, same files, faster on your
Mac Studio.

**Success criterion:** you look at the diversified top 20 and say it found
keepers. That's the whole test. (The `train` step also prints a ROC-AUC number —
above 0.6 means better than chance — but your eyes are the verdict.)

Everything below runs on the Mac Studio. Nothing here touches the web app.

---

## 0. One-time setup

```bash
cd Kinetic_Curator/studio
pip install -e ".[curator]"     # mlx-embeddings + pillow + numpy + scikit-learn
```

First `embed` run downloads the SigLIP weights from Hugging Face (~2 GB,
one time, lives in `~/.cache/huggingface`).

Sanity check (no model needed, runs anywhere):

```bash
python3 studio/curator.py selfcheck   # -> "curator selfcheck OK"
```

Smoke test the MLX path on 3 images before the big run:

```bash
mkdir -p /tmp/curator-smoke && cp pool/seed-0001.png pool/seed-0002.png pool/seed-0003.png /tmp/curator-smoke/
python3 studio/curator.py embed /tmp/curator-smoke/
# -> /tmp/curator-smoke/curator-index.npz  (3 x 1152)
```

## 1. Benchmark — MLX vs the old torch path (images/sec)

Time the new backend on 200 images (timings exclude the one-time model load):

```bash
python3 - <<'EOF'
import time, glob
from pathlib import Path
from curator import embed_images
paths = sorted(Path("pool").rglob("*.png"))[:200]
t = time.time(); embed_images(paths, "mlx-community/siglip-so400m-patch14-384", log=lambda *_: None)
print(f"MLX SigLIP: {200/(time.time()-t):.1f} images/sec")
EOF
```

The old torch/open_clip backend is no longer in the repo, so to compare, run
this in a throwaway venv (it does not touch your install):

```bash
python3 -m venv /tmp/torchbench && /tmp/torchbench/bin/pip install -q torch open_clip_torch pillow numpy
/tmp/torchbench/bin/python - <<'EOF'
import time, torch, open_clip
from pathlib import Path
from PIL import Image
model, _, preprocess = open_clip.create_model_and_transforms("ViT-L-14-quickgelu", pretrained="openai")
device = "mps" if torch.backends.mps.is_available() else "cpu"
model = model.to(device).eval()
paths = sorted(Path("pool").rglob("*.png"))[:200]
t = time.time()
with torch.no_grad():
    for i in range(0, 200, 32):
        px = torch.stack([preprocess(Image.open(p).convert("RGB")) for p in paths[i:i+32]])
        model.encode_image(px.to(device))
print(f"torch/open_clip ({device}): {200/(time.time()-t):.1f} images/sec")
EOF
```

Expect MLX to win on Apple Silicon (unified memory, no MPS copy overhead).
Either way, write both numbers down — they're the baseline for future phases.

## 2. The full Phase 1 loop

**a) Render a pool** (200 is a good first size; more is better for training):

```bash
python3 studio/studio.py batch -o pool/ --count 200
```

**b) Embed it** (this is the new MLX step):

```bash
python3 studio/curator.py embed pool/
# -> pool/curator-index.npz  (200 x 1152)
```

**c) Label likes vs passes** — pick whichever feels faster:

```bash
# Flip through one by one in Preview (y = like, n = pass):
python3 studio/curator.py label --index pool/curator-index.npz --out labels.json

# ...or contact sheets, then list the winners by number:
python3 studio/curator.py sheet --index pool/curator-index.npz --out sheets/
python3 studio/curator.py apply-sheet --index pool/curator-index.npz \
    --out labels.json --likes 3,7,12,41 --passes 5,9,22
```

Aim for **at least 20 likes and 20 passes** — the probe needs both sides.
Shortcut: your HITS exports convert directly —
`python3 studio/hits_bridge.py build --help` turns favourited seeds into
`labels.json`.

**d) Train the taste model:**

```bash
python3 studio/curator.py train --index pool/curator-index.npz \
    --labels labels.json --out taste.npz
```

Watch the ROC-AUC line: **> 0.6 = better than chance**, higher = more signal.
If it's ~0.5, you need more labels (or more varied ones).

**e) Rank a fresh batch and look at the top 20:**

```bash
python3 studio/studio.py batch -o pool2/ --count 200 --start-seed 10000
python3 studio/curator.py embed pool2/
python3 studio/curator.py rank --index pool2/curator-index.npz \
    --model taste.npz -k 20 --open
```

`--open` pops the 20 in Preview. The list is diversified — similar-looking
renders get spread out so you see 20 *different* candidates, not 20 siblings.

**The verdict is yours:** did it find keepers? If yes, Phase 1 is done and the
taste model graduates to real work (Smart Evolve, semantic search). If no —
more labels, or tell me and we dig into why.

## 3. Notes

- **Old indexes don't carry over.** If you embedded with the old torch/CLIP
  backend, re-run `embed` — the `.npz` format is identical, but the numbers
  inside come from a different model (1152 dims now, was 768). The `train`
  step refuses to mix them, loudly, rather than silently giving wrong answers.
- **`selfcheck` is still stdlib-only.** All MLX/torch imports live behind the
  model-loading boundary; `python3 studio/curator.py selfcheck` needs nothing
  installed.
- **No web-app changes.** This is all `studio/` Python. The app never sees MLX.
- First `embed` on a fresh machine is slow (weight download); subsequent runs
  are fast. If `embed` fails to load the model, the error message tells you
  exactly what to install.
