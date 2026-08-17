"""
Vercel entrypoint for the AlphaForge FastAPI backend.

Vercel's FastAPI support looks for an `app` object in common root entrypoints
such as `index.py`. We re-export the existing API app here so deployment does
not require moving the current backend module layout around.
"""

from api.server import app

