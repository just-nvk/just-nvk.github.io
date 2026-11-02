import sys
from PIL import Image
src, h = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1000
im = Image.open(src); W, H = im.size
base = src[:-4]; n = 0; y = 0
while y < H:
    n += 1; im.crop((0, y, W, min(H, y + h))).save(f'{base}-p{n}.png'); y += h
print(base, n, 'parts', W, H)
