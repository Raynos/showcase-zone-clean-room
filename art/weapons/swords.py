"""Swords: shop blade, bandsaw sabre, arc cutter. See common.py."""
from weapons import common as W

TEX = 1024
BUILD = W.BUILD


def make():
    return W.pack('swords', [('shop_blade', W.shop_blade), ('bandsaw', W.bandsaw), ('arc_cutter', W.arc_cutter)])
