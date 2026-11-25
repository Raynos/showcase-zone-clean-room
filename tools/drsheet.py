"""Contact sheet of dressing screenshots: drsheet.py <out> <name> [<name>...] (names under shots/dress)."""
import sys
from PIL import Image

names = sys.argv[2:]
ims = [Image.open(f'shots/dress/{n}.png').resize((402, 874)) for n in names]
w = Image.new('RGB', (402 * len(ims), 874))
for i, im in enumerate(ims):
    w.paste(im, (402 * i, 0))
w.save(f'shots/dress/{sys.argv[1]}.png')
print(f'shots/dress/{sys.argv[1]}.png')
