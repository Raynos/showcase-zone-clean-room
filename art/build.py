"""
Rebuild the game's models:  blender -b --factory-startup -P art/build.py -- [name ...]

With no names every model is rebuilt. Each model is a module with make() -> kit.Model, plus
TEX (texture size) and BUILD (bake / paint settings). Output goes to public/models/.
"""
import importlib
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from lib import export  # noqa: E402

MODELS = {
    'mite': 'robots.mite', 'pallet': 'robots.pallet', 'drone': 'robots.drone', 'sentry': 'robots.sentry',
    'riveter': 'robots.riveter', 'welder': 'robots.welder', 'foreman': 'robots.foreman',
    'warden': 'robots.warden', 'titan': 'robots.titan',
    'rook': 'people.rook', 'folk': 'people.folk',
    'horse': 'mounts.horse', 'hoverboard': 'mounts.hoverboard',
}


def exists(mod):
    return os.path.exists(os.path.join(HERE, *mod.split('.')) + '.py')


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    names = [a for a in argv if not a.startswith('-')] or [n for n, m in MODELS.items() if exists(m)]
    t0 = time.time()
    for n in names:
        mod = importlib.import_module(MODELS[n])
        model = mod.make()
        meta = export.build(model, tex=getattr(mod, 'TEX', 512), post=getattr(mod, 'post', None), **getattr(mod, 'BUILD', {}))
    print(f'done: {len(names)} model(s) in {time.time() - t0:.0f}s')


main()
