"""Spears: rebar pike, jack lance, stormrod. See common.py."""
from weapons import common as W

TEX = 1024
BUILD = W.BUILD


def make():
    return W.pack('spears', [('rebar_pike', W.rebar_pike), ('jack_lance', W.jack_lance), ('stormrod', W.stormrod)])
