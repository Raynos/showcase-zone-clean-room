#!/usr/bin/env python3
"""Cut the trailers from recorded frames, as tools/trailer/cuts.json says.

    python3 tools/trailer/edit.py <frames dir> <out dir> [30 15] [--aspect l|p]

<frames dir> holds <shot>-l / <shot>-p (tools/trailer/shoot.sh), card-l / card-p (card.sh) and
trailer-<edit>.wav (render.mjs; without it the cut is silent). Writes cratefall-<edit>s.mp4
(landscape 1920x1080) and cratefall-<edit>s-portrait.mp4 (1080x1920): H.264 High, yuv420p, 30 fps,
AAC 160k, faststart, sized to stay under about 15 MB. Then a poster and a contact sheet (a frame
every half second) per file, the sheet beside the frames, not in the repo.
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
flags = sys.argv[1:]
args = [a for i, a in enumerate(flags) if not a.startswith('--') and (i == 0 or flags[i - 1] != '--aspect')]
FRAMES, OUT = os.path.abspath(args[0]), os.path.abspath(args[1])
EDITS = args[2:] or ['30', '15']
ASPECTS = [flags[flags.index('--aspect') + 1]] if '--aspect' in flags else ['l', 'p']
cuts = json.load(open(os.path.join(HERE, 'cuts.json')))
FPS, BPM = cuts['fps'], cuts['bpm']
PER_BEAT = FPS * 60 / BPM  # 12 frames
os.makedirs(OUT, exist_ok=True)
work = os.path.join(FRAMES, '_edit')
os.makedirs(work, exist_ok=True)


def frames_of(dirname, start, n):
    d = os.path.join(FRAMES, dirname)
    files = sorted(f for f in os.listdir(d) if f.endswith(('.jpg', '.png')))
    if start + n > len(files):
        raise SystemExit(f'{dirname}: wants frames {start}..{start + n - 1}, has {len(files)}')
    return [os.path.join(d, f) for f in files[start:start + n]]


for eid in EDITS:
    e = cuts['edits'][eid]
    for asp in ASPECTS:
        seq, t, log = [], 0, []
        for s in e['shots']:
            n = round(s['beats'] * PER_BEAT)
            if s.get('card'):
                # the card is screenshots (PNG); the concat demuxer takes one image format, so it joins as JPEG
                src, dst = os.path.join(FRAMES, 'card-' + asp), os.path.join(FRAMES, 'card-' + asp + '-jpg')
                if not os.path.isdir(dst) or len(os.listdir(dst)) < len(os.listdir(src)):
                    os.makedirs(dst, exist_ok=True)
                    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', os.path.join(src, '%05d.png'), '-q:v', '1', '-qmin', '1',
                                    '-start_number', '0', os.path.join(dst, '%05d.jpg')], check=True)
                fr = frames_of('card-' + asp + '-jpg', 0, n)
                name = 'card'
            else:
                start = s.get('pin', s['in']) if asp == 'p' else s['in']
                fr = frames_of(f"{s['shot']}-{asp}", start, n)
                name = s['shot']
            log.append(f'{t / FPS:5.1f}s {name} ({n} frames)')
            seq += fr
            t += n
        want = round(e['beats'] * PER_BEAT)
        assert len(seq) == want, (eid, asp, len(seq), want)
        lst = os.path.join(work, f'{eid}-{asp}.txt')
        with open(lst, 'w') as f:
            for p in seq:
                f.write(f"file '{p}'\nduration {1 / FPS:.6f}\n")
            f.write(f"file '{seq[-1]}'\n")
        size = '1920:1080' if asp == 'l' else '1080:1920'
        name = f'cratefall-{eid}s' + ('' if asp == 'l' else '-portrait') + '.mp4'
        out = os.path.join(OUT, name)
        wav = os.path.join(FRAMES, f'trailer-{eid}.wav')
        dur = len(seq) / FPS
        cmd = ['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst]
        if os.path.exists(wav):
            cmd += ['-i', wav]
        # a 3.5 Mbps cap keeps 30 s near 14 MB with the audio; the frames are clean renders, so CRF 20 rarely reaches it
        cmd += ['-vf', f'scale={size}:flags=lanczos:in_range=pc:out_range=tv,fps={FPS},format=yuv420p', '-color_range', 'tv', '-t', f'{dur:.3f}',
                '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-crf', '20', '-maxrate', '3.5M', '-bufsize', '7M',
                '-g', str(FPS), '-movflags', '+faststart']
        if os.path.exists(wav):
            # the game mixes for a phone speaker under play; a trailer stands alone, so it is brought to -16 LUFS
            cmd += ['-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
                    '-af', f'loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st={dur - 0.25:.3f}:d=0.25']
        cmd.append(out)
        subprocess.run(cmd, check=True)
        mb = os.path.getsize(out) / 1e6
        print(f'{name}: {dur:.1f} s, {mb:.1f} MB, {"sound" if os.path.exists(wav) else "silent"}')
        for line in log:
            print('   ', line)
        # contact sheet: every half second
        cols = 10 if asp == 'l' else 15
        w = 192 if asp == 'l' else 128
        rows = -(-int(dur * 2) // cols)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', out, '-vf', f'fps=2,scale={w}:-1,tile={cols}x{rows}', '-frames:v', '1',
                        os.path.join(work, name.replace('.mp4', '-sheet.jpg'))], check=True)
