#!/usr/bin/env python3
"""Writes the image-generation prompt for every painted texture.

    python3 tools/tex/prompts.py            # (re)write public/tex/prompts/*.txt

One prompt per texture, kept beside the shipped image so any texture can be
regenerated: tools/tex/gen.sh <name> paints it with the codex CLI's image tool,
tools/tex/bake.py turns the painting into the 512x512 tile under public/tex/.
The game recolours every tile (src/gfx/textures.ts divides out its mean colour
and lets vertex colour tint it), so the prompts ask for natural colours.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(os.path.dirname(HERE)), "public", "tex", "prompts")

STYLE = """Style: a hand-painted stylised game texture, as in a top-tier stylised fantasy MMO. Chunky readable shapes, a painted light bevel on the upper edge of every raised form and a soft painted shadow in every crease, visible confident brushwork, rich but natural colour with small hue shifts. No photographic noise, no photo-realism.

View: perfectly flat and straight on (orthographic), evenly lit, with no perspective, no cast shadows from outside the surface, no vignette, no border or frame, no text, no logo, no watermark. The surface fills the whole image edge to edge."""

TILE = """It must tile seamlessly in both directions: whatever touches the left edge continues exactly on the right edge, and whatever touches the top edge continues exactly on the bottom edge. Keep brightness and colour even across the whole image, with no large light or dark patches and no single eye-catching feature, so the repeat is not obvious when it is laid side by side many times."""

NOTILE = """This one does not tile: it is a single square face seen straight on, filling the image exactly to its four edges."""

END = """After saving, reply with one line stating the file path and its size in pixels. If you have no image generation tool available, say so plainly and do not draw the image with code."""

# name: (subject, tiles?)
TEX = {
    "cobble": ("Crazy paving for a town square: about thirty flat, irregular polygonal flagstones of varied size fitted tightly together. Warm grey-beige stone whose tone varies a little from stone to stone. Each stone has a soft worn bevel, a few have small chips or a hairline crack. Narrow dark recessed joints with a little sand and a few specks of moss.", True),
    "paver": ("Rectangular flagstone paving for an old town road: four horizontal rows of large worn stone slabs, about two slabs per row, with the joints staggered from one row to the next and slab lengths varying. The slabs differ clearly in tone from one to the next: warm buff, cool grey, a few darker brown-grey. Every slab is strongly bevelled, with a broad painted highlight along its upper edge, a dark shadow along its lower edge, a slightly domed worn face with brush texture, and here and there a chipped corner or a crack. Deep dark joints with a little sand and a few specks of moss.", True),
    "stonewall": ("A wall of rough-hewn dressed stone blocks in running bond: four horizontal courses, about two blocks per course, joints staggered from course to course. The blocks differ clearly in tone: pale grey, warm buff, a few darker blue-grey. Each block is individually bevelled with a painted highlight on its upper edge and a shadow beneath, a chiselled face with visible tool marks, chipped corners and a few cracks. Deep dark recessed mortar joints.", True),
    "roof": ("Clay roof tiles: five horizontal rows of overlapping scalloped terracotta shingles, about five per row, each row staggered and overlapping the row below with a dark shadow under each lower edge. Orange terracotta whose tone varies tile to tile, a few chipped corners, a few slightly darker weathered tiles.", True),
    "planks": ("Old wooden boards: four wide horizontal planks running the full width of the image, each a slightly different honey-brown tone, with long flowing grain, a few knots, dark gaps between boards, pale chipped and worn edges, and a pair of small iron nail heads here and there.", True),
    "crate": ("The front face of a sturdy wooden shipping crate. Five horizontal honey-coloured planks with grain and dark gaps, enclosed by a raised frame of four boards around the edge, and one raised diagonal brace board running from the top-left corner to the bottom-right corner. Iron nail heads at the frame corners and along the brace, pale chipped edges, a few scuffs.", False),
    "crate2": ("The front face of a sturdy wooden shipping crate. Five horizontal honey-coloured planks with grain and dark gaps, enclosed by a raised frame of four boards around the edge, and two raised diagonal brace boards forming an X from corner to corner. Iron nail heads at the frame corners and along the braces, pale chipped edges, a few scuffs.", False),
    "plaster": ("An old lime-plastered house wall: cream stucco with soft trowel marks, gentle mottling, a few hairline cracks and two or three small shallow chips where a darker undercoat shows.", True),
    "metal": ("One square plate of painted steel, light grey, filling the image. A narrow recessed seam runs along all four edges and eight domed rivets sit just inside the seam (one near each corner and one at the middle of each side). The paint is chipped to bare bright metal along the seam and around the rivets, with thin orange-brown rust streaks running down from the rivets and collecting along the bottom seam. Subtle brushed sheen on the paint.", True),
    "concrete": ("Cast concrete wall made of formwork panels: a two by two grid of large square concrete panels separated by narrow recessed seams, with a small round tie-rod hole near each corner of every panel. Mid grey concrete, softly mottled, with small pores and pits, a few hairline cracks, darker grime gathered along the seams, pale chipped panel edges, and faint dark water stains running downward from the seams and holes.", True),
    "rock": ("A sedimentary cliff face: horizontal rock strata of varied thickness stacked from top to bottom, each layer a chunky ledge with a painted light top edge and a shadowed underside, broken by vertical cracks and a few fallen-away blocks. Grey stone with slight warm and cool shifts between layers.", True),
    "dirt": ("Packed dry earth seen from directly above: warm brown dirt with soft mottling, small cracks, scattered pebbles of a few sizes and a few tiny twigs.", True),
    "grassground": ("A meadow floor seen from directly above: short dense grass painted as many small overlapping tufts and blade strokes, with a little bare earth showing between some tufts and a few fallen leaves. Mid green-gold, slightly varied.", True),
    "gravel": ("Loose gravel seen from directly above: many small rounded and angular stones of varied size packed together, mostly mid grey with a few lighter and a few warmer stones, dark gaps between them.", True),
    "sand": ("Fine dry sand seen from directly above: pale warm tan, with soft wind ripples, faint mottling and a few tiny pebbles and shell-like flecks.", True),
    "bark": ("Tree bark: deep vertical ridges and furrows running top to bottom, chunky plates of bark with painted light edges and dark cracks between them, warm grey-brown.", True),
    "canvas": ("Heavy woven canvas cloth: a clear plain weave, pale off-white, with soft diagonal sag folds, a stitched seam running across, and slight uneven fading.", True),
    "plate": ("Steel diamond tread plate floor: a regular grid of raised lozenge studs in alternating diagonal directions on bare steel, about eight studs across, with worn bright tops on the studs, darker grime between them and a few scratches.", True),
    "tile": ("Industrial floor tiles: a two by two grid of large square dark-grey composite floor panels with a narrow recessed groove between them, a thin inset border line inside each panel, scuff marks, scratches and a few chipped corners showing lighter material.", True),
    "panel": ("One square industrial wall panel of painted steel, mid grey, filling the image: a bevelled outer seam on all four edges, a recessed inner panel, a row of four horizontal vent slots in the upper middle, small bolts at the corners, paint chipped to bare metal on the bevels and light rust streaks under the vents.", True),
    "redbrick": ("A wall of small red clay bricks in running bond: eight horizontal courses, about four bricks per course, joints staggered from course to course. Brick red and orange-red, varying from brick to brick, with a few darker burnt bricks and a few paler ones. Each brick has a worn bevelled edge with a painted highlight on top; several have chipped corners. Slightly recessed pale sandy mortar with dark shadow lines under each brick.", True),
    "timber": ("A dark stained timber beam surface for half-timbered houses: old oak planks running horizontally, the full width of the image, deep brown, with long flowing grain, a few knots and splits, adze marks, and pale worn edges where boards meet.", True),
    "brass": ("Old cast brass for an ornamental clockwork fountain: warm golden brass with a softly hammered, dimpled surface, dark brown patina with faint green verdigris settled in the recesses, bright worn highlights on raised spots and fine scratches. Shallow engraved grooves divide it into a two by two grid of panels, each panel edged by a raised bevelled rim with a small domed stud at each corner.", True),
    "leaflitter": ("Autumn leaf litter seen from directly above: fallen maple-like leaves in orange, gold and rust lying loosely scattered over dark earth, with a few twigs. Leaves cover about half of the ground.", True),
}

W = 1024


def prompt(name: str) -> str:
    subject, tiles = TEX[name]
    return "\n\n".join([
        f"Use your image generation tool to paint a square {W}x{W} texture for a video game and save it as {name}.png in the current directory.",
        "Subject: " + subject,
        STYLE,
        TILE if tiles else NOTILE,
        END,
    ]) + "\n"


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for n in TEX:
        with open(os.path.join(OUT, n + ".txt"), "w") as f:
            f.write(prompt(n))
    print(f"wrote {len(TEX)} prompts to {OUT}")
