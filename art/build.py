"""
Rebuild the game's models:  blender -b --factory-startup -P art/build.py -- [name ...]

With no names every model is rebuilt. Each model is a module with make() -> kit.Model, plus
TEX (texture size) and BUILD (bake / paint settings). Output goes to public/models/.
"""
import importlib
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from lib import export  # noqa: E402

MODELS = {
    'mite': 'robots.mite',
}


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    names = [a for a in argv if not a.startswith('-')] or list(MODELS)
    t0 = time.time()
    index_path = os.path.join(export.OUT, 'index.json')
    index = {}
    if os.path.exists(index_path):
        with open(index_path) as f: index = json.load(f)
    for n in names:
        mod = importlib.import_module(MODELS[n])
        model = mod.make()
        meta = export.build(model, tex=getattr(mod, 'TEX', 512), post=getattr(mod, 'post', None), **getattr(mod, 'BUILD', {}))
        index[n] = meta
    with open(index_path, 'w') as f:
        json.dump(index, f, indent=1, sort_keys=True)
        f.write('\n')
    print(f'done: {len(names)} model(s) in {time.time() - t0:.0f}s')


main()
