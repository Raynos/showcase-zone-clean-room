"""Bows: trainer recurve, tension compound, arcstring. See common.py."""
from weapons import common as W

TEX = 1024
BUILD = W.BUILD


def make():
    return W.pack('bows', [('trainer_bow', W.trainer_bow), ('tension_bow', W.tension_bow), ('arcstring', W.arcstring)])
