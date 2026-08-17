"""
Regenerate the real product screenshots used on the marketing pages.

Usage (with the app running on :3000 and the API on :8000):

  1. start headless Chrome with a debugging port:
       chrome --headless=new --disable-gpu --hide-scrollbars               --remote-debugging-port=9222 --window-size=1440,1000 about:blank
  2. python scripts/capture_shots.py frontend/public/shots
  3. crop to 16:10 and downscale (the loop at the bottom of this file's docstring):
       from PIL import Image; im = Image.open(f).convert("RGB")
       im.crop((0, 0, im.width, int(im.width*10/16))).resize((1600, 1000)).save(f, optimize=True)

Capture real screenshots of the running AlphaForge modules via Chrome DevTools
Protocol. No new dependencies: uses the installed Chrome + the `websockets`
package that is already present.

Each module now waits for an explicit Run, so the flow per shot is:
  navigate -> click the idle Run button -> poll until results render -> clip+shoot
"""
from __future__ import annotations

import asyncio
import base64
import json
import pathlib
import sys

import websockets
import urllib.request

CDP = "http://127.0.0.1:9222"
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT.mkdir(parents=True, exist_ok=True)


def ws_url() -> str:
    with urllib.request.urlopen(f"{CDP}/json/list") as r:
        tabs = json.load(r)
    pages = [t for t in tabs if t.get("type") == "page"]
    return pages[0]["webSocketDebuggerUrl"]


class Chrome:
    def __init__(self, ws):
        self.ws = ws
        self.i = 0

    async def cmd(self, method, **params):
        self.i += 1
        mid = self.i
        await self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    async def js(self, expr):
        r = await self.cmd("Runtime.evaluate", expression=expr,
                           returnByValue=True, awaitPromise=True)
        return r.get("result", {}).get("value")

    async def goto(self, url, settle=3.0):
        await self.cmd("Page.navigate", url=url)
        await asyncio.sleep(settle)

    async def wait_for(self, predicate_js, timeout=240, every=2.0):
        waited = 0.0
        while waited < timeout:
            if await self.js(f"(() => {{ try {{ return !!({predicate_js}); }} catch (e) {{ return false; }} }})()"):
                return True
            await asyncio.sleep(every)
            waited += every
        return False

    async def click_text(self, pattern):
        return await self.js(f"""
            (() => {{
              const b = [...document.querySelectorAll('button')]
                .find(x => /{pattern}/i.test(x.innerText));
              if (!b) return false;
              b.click(); return true;
            }})()
        """)

    async def hide_chrome(self):
        """Hide the site nav and the input panels — a product shot should show
        the OUTPUT, not the form used to get it."""
        await self.js("""
            (() => {
              document.querySelectorAll('nav').forEach(n => n.style.display = 'none');
              const sec = document.querySelector('section.mx-auto');
              if (!sec) return false;
              // The control panels are the leading children before the first result block.
              [...sec.children].forEach(el => {
                const t = el.innerText || '';
                const isControls = /TICKER|Data Engine|UPDATE MODE|Forecast days|Primary factor|Hidden states|Confidence level|Strategy\\n/i.test(t)
                                   && el.querySelector('input, button');
                if (isControls) el.style.display = 'none';
              });
              return true;
            })()
        """)
        await asyncio.sleep(0.4)

    async def shot_from(self, name, anchor_text, height=1000, pad=12):
        """Clip a fixed-height product shot starting at the block containing `anchor_text`."""
        box = await self.js(f"""
            (() => {{
              const needle = {json.dumps(anchor_text)};
              const sec = document.querySelector('section.mx-auto');
              if (!sec) return null;
              const el = [...sec.children].find(c => (c.innerText || '').includes(needle));
              if (!el) return null;
              el.scrollIntoView({{block:'start'}});
              const r = el.getBoundingClientRect();
              return {{x: r.x + scrollX, y: r.y + scrollY, w: r.width}};
            }})()
        """)
        if not box:
            print(f"    !! anchor not found for {name}: {anchor_text}")
            return False
        await asyncio.sleep(0.6)
        clip = {"x": max(0, box["x"] - pad), "y": max(0, box["y"] - pad),
                "width": box["w"] + pad * 2, "height": height, "scale": 2}
        r = await self.cmd("Page.captureScreenshot", format="png",
                           clip=clip, captureBeyondViewport=True)
        (OUT / f"{name}.png").write_bytes(base64.b64decode(r["data"]))
        print(f"    saved {name}.png")
        return True

    async def shot(self, name, selector, pad=14):
        """Clip to an element's box so the product shot is tight, not a full page."""
        box = await self.js(f"""
            (() => {{
              const el = document.querySelector({json.dumps(selector)});
              if (!el) return null;
              el.scrollIntoView({{block:'start'}});
              const r = el.getBoundingClientRect();
              return {{x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height}};
            }})()
        """)
        if not box:
            print(f"    !! selector not found for {name}: {selector}")
            return False
        await asyncio.sleep(0.6)
        clip = {
            "x": max(0, box["x"] - pad), "y": max(0, box["y"] - pad),
            "width": box["w"] + pad * 2, "height": min(box["h"] + pad * 2, 1400),
            "scale": 2,
        }
        r = await self.cmd("Page.captureScreenshot", format="png",
                           clip=clip, captureBeyondViewport=True)
        path = OUT / f"{name}.png"
        path.write_bytes(base64.b64decode(r["data"]))
        print(f"    saved {path.name}  {int(clip['width'])}x{int(clip['height'])}")
        return True


async def main():
    async with websockets.connect(ws_url(), max_size=80 * 1024 * 1024) as ws:
        c = Chrome(ws)
        await c.cmd("Page.enable")
        await c.cmd("Runtime.enable")
        await c.cmd("Emulation.setDeviceMetricsOverride",
                    width=1440, height=1000, deviceScaleFactor=2, mobile=False)

        # ── Dashboard ────────────────────────────────────────────────────────
        print("  dashboard…")
        await c.goto("http://localhost:3000/features/dashboard")
        await c.click_text("LOAD DASHBOARD")
        await c.wait_for("document.body.innerText.includes('LAST CLOSE')", timeout=120)
        await asyncio.sleep(2.5)
        await c.hide_chrome()
        await c.shot_from("dashboard", "LAST CLOSE", height=980)

        # ── Backtester ───────────────────────────────────────────────────────
        print("  backtester…")
        await c.goto("http://localhost:3000/features/backtester")
        await c.click_text("RUN BACKTEST")
        await c.wait_for("document.body.innerText.includes('Strategy vs Buy & Hold')", timeout=240)
        await asyncio.sleep(3)
        await c.hide_chrome()
        await c.shot_from("backtest", "CAGR", height=980)

        # ── Honesty Engine ───────────────────────────────────────────────────
        print("  honesty…")
        await c.goto("http://localhost:3000/features/honesty-engine")
        await c.click_text("RUN HONESTY CHECK")
        await c.wait_for("document.body.innerText.includes('HONESTY VERDICT')", timeout=240)
        await asyncio.sleep(2.5)
        await c.hide_chrome()
        await c.shot_from("honesty", "HONESTY VERDICT", height=980)

        # ── Prediction Studio (train with light settings so it finishes) ─────
        print("  prediction… (training, this takes a couple of minutes)")
        await c.goto("http://localhost:3000/features/prediction")
        await c.js("""
            (() => {
              const setNative = (el, v) => {
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
                el.dispatchEvent(new Event('input', {bubbles: true}));
                el.dispatchEvent(new Event('change', {bubbles: true}));
              };
              const d = document.querySelector('input[type=date]');
              if (d) setNative(d, '2022-01-01');
              const r = [...document.querySelectorAll('input[type=range]')];
              if (r[1]) setNative(r[1], '40');   // look-back
              if (r[2]) setNative(r[2], '5');    // epochs
              return true;
            })()
        """)
        await asyncio.sleep(0.8)
        await c.click_text("TRAIN MODELS")
        ok = await c.wait_for("document.body.innerText.includes('Model scorecard')",
                              timeout=600, every=5)
        print(f"    trained: {ok}")
        await asyncio.sleep(3)
        await c.hide_chrome()
        await c.shot_from("prediction", "LAST CLOSE", height=980)

    print("done")


asyncio.run(main())
