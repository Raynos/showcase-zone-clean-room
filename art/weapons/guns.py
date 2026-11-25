"""Crossbows and rifles: bolt driver, twin driver, rivet rifle, rail rifle. See common.py."""
from weapons import common as W

TEX = 1024
BUILD = W.BUILD


def make():
    return W.pack('guns', [('bolt_driver', W.bolt_driver), ('twin_driver', W.twin_driver), ('rivet_rifle', W.rivet_rifle), ('rail_rifle', W.rail_rifle)])
