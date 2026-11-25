#!/usr/bin/env python3
"""Print the remaster prompt for one golden frame.

    python3 tools/golden/prompt.py 08-crate-fields-fight

The prompt is prompts/_brief.txt with the frame's own sections filled in.
A frame file (prompts/NN-name.txt) has:

    ## scene     one sentence saying what the screenshot shows
    ## improve   a bullet list of what the remaster should raise
    ## hud       optional: replaces the standard "keep the HUD" sentence
    ## nohero    optional: the hero is not in this frame

The fixed rules (same camera, composition, palette, HUD layout; stylised, not
photorealistic; no new gameplay elements or text) live in _brief.txt and apply
to every frame. Never put personal or account details in a prompt.
"""
import os
import re
import sys

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'prompts')


def read(name):
    with open(os.path.join(HERE, name + '.txt')) as f:
        return f.read()


def compose(frame):
    sections, cur = {}, None
    for line in read(frame).splitlines():
        m = re.match(r'^##\s*(\w+)\s*$', line)
        if m:
            cur = m.group(1)
            sections[cur] = []
        elif cur:
            sections[cur].append(line)
    sec = {k: '\n'.join(v).strip() for k, v in sections.items()}
    nohero = 'nohero' in sec
    out = read('_brief')
    out = out.replace('{SCENE}', sec['scene'])
    out = out.replace('{IMPROVE}', sec['improve'])
    out = out.replace('{HUD}', sec.get('hud') or read('_hud').strip())
    out = out.replace('{HERO_KEEP}', '' if nohero else 'the hero position and pose, ')
    out = out.replace('{HERO}', '' if nohero else read('_hero').rstrip('\n') + '\n')
    return out


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.stdout.write(compose(sys.argv[1]))
