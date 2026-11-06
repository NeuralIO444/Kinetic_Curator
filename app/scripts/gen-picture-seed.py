# gen-picture-seed.py — authoring-time generator for src/pattern/pictureSeed.js (#1795).
#
# NOT part of the build and never run by the app: it ran once to bake the
# bundled seed picture (the repo's own src/assets/about-matt-ciaglia.jpg)
# into the committed RGB grid the pattern engine samples. Kept so the bake
# is reproducible and its provenance is checkable:
#
#   python3 scripts/gen-picture-seed.py   (needs Pillow)
#
# Recipe: open the 480×480 portrait, centre-crop to 4:3, downsample to
# 64×48 with LANCZOS, emit the raw RGB bytes as hex into pictureSeed.js.
from PIL import Image

im = Image.open('src/assets/about-matt-ciaglia.jpg').convert('RGB')
w, h = im.size
ch = int(w * 3 / 4)
top = (h - ch) // 2
im = im.crop((0, top, w, top + ch)).resize((64, 48), Image.LANCZOS)
print(im.tobytes().hex())
