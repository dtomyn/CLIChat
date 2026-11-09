"""Lumen explainer video: two personas, filmed from the real app.

  python film/make_video.py --record    Run every conversation once against the real AI engine and save it (slow, ~15 min).
  python film/make_video.py --record --resume   Same, but replay what is already recorded and only run the missing requests.
  python film/make_video.py --voice     Make the narration only (Kokoro, local) and print each line's length.
  python film/make_video.py             Film the app (replaying the recording), then mix and encode film/out/lumen-explainer.mp4.
  python film/make_video.py --stills    Film, then save a contact sheet of frames instead of encoding (quick check).

Needs: .venv with playwright, kokoro-onnx, soundfile, imageio-ffmpeg, numpy; Microsoft Edge; Kokoro model files in .venv/kokoro
(kokoro-v1.0.onnx and voices-v1.0.bin, as in IRISIdeas). Narration is cached in film/vo and remade only when a line changes.
"""
import argparse
import base64
import hashlib
import json
import os
import pathlib
import random
import shutil
import subprocess
import sys
import time
import urllib.request

import numpy as np
import soundfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
FILM = ROOT / "film"
WORK = FILM / ".work"
OUT = FILM / "out"
VO = FILM / "vo"
REC = FILM / "recordings" / "v2" / "recording.json"  # v2: three personas, filmed after the chat-workflow and lifecycle updates
KOKORO = ROOT / ".venv" / "kokoro"
VOICE, VOICE_SPEED, VOICE_RATE = "af_heart", 1.0, 24000
RATE = 48000
PORT = 4395
VIEW, DSF = (1600, 900), 1.2  # renders at 1920x1080
WORKSPACE = WORK / "Lumen"
DEMO = WORKSPACE / "Contoso CRM Migration (demo)"
NAME = "lumen-explainer-v2"

# ------------------------------------------------------------------ narration
LINES = {
    "intro1": "Everyone on the team now has V S Code, GitHub Copilot, and the Claude command line. Powerful tools. But not everyone wants to live in a terminal.",
    "intro2": "Meet Lumen. The same A I agents and skills, behind a friendly chat window that runs on your own computer.",
    "overview2": "Lumen greets you by name. Instead of agents and prompts, you pick an assistant, a specialist with its own skills, start from a quick start, or follow a guided delivery lifecycle.",
    "marcus1": "Marcus is a business analyst on the Contoso C R M project. He needs user stories by Friday, and he has never written a prompt in his life.",
    "marcus2": "So he picks the Requirements Coach, and clicks one of its suggestions.",
    "marcus3": "The answer streams in, like chatting with a colleague who has done this a hundred times.",
    "marcus4": "User stories, Given, When, Then acceptance criteria, and the open questions to take back to the business.",
    "marcus_next": "It even suggests a next step. One click away.",
    "marcus_actions": "Every reply can be retried, branched into a new chat, rated, or saved as a document.",
    "marcus_word": "The business wants Word, so, Save as, Word document. Real headings, lists, and tables, saved to his project folder.",
    "marcus5":"Next, Marcus wants a helper for test scripts. One sentence is enough.",
    "marcus6": "Lumen drafts the name, the icon, the instructions, and example requests. It even switches on the Excel skill.",
    "marcus7": "No configuration files. No jargon. Just a new teammate.",
    "priya1": "Now meet Priya, the project manager. Her world is a Microsoft Project plan and a stack of Excel workbooks, and the steering committee is on Thursday.",
    "priya2": "One click sets up the project folder.",
    "priya3": "Here is the plan from Microsoft Project, forty two tasks with a baseline, plus a budget tracker, a raid log, timesheets, and this week's progress update in Excel.",
    "priya4": "She asks for a health check. Lumen has already picked the right plan from her folder.",
    "priya5": "The Schedule Analyst reads the actual plan. Critical path, slippage against baseline, and who is over allocated.",
    "priya6": "Amber, trending red. Go-live has slipped ten working days, there is no float left, and one integration developer is the bottleneck. It even warns that the progress data is two weeks old.",
    "priya_repeat": "Any table copies straight into Excel or Outlook. And because she wants this check every week, she sets it to repeat.",
    "priya_weekly": "Mondays at nine. Lumen runs it while it is open, and leaves the result waiting as an unread chat.",
    "priya7":"Friday's progress arrived as a spreadsheet. Instead of retyping it into Project, Priya hands it over.",
    "priya8": "Lumen reads the workbook, updates the plan, saves a new version without touching the original, and checks the schedule again.",
    "priya9": "Every change is listed, before and after. Progress is up from forty seven to fifty three percent, and it warns that the E R P delay will push go-live back another three days.",
    "priya_diff": "And See changes shows exactly what moved. Every task field, before and after.",
    "priya12": "When she wants a file, she lets Lumen edit, with one click.",
    "priya13": "And gets a colour coded Excel tracker, with a Gantt chart, ready for the steering committee.",
    "dana1": "Finally, meet Dana, the delivery lead on the Online Permit Renewal program. Requirements, design, and stories all have to line up, and the auditors will ask how.",
    "dana2": "The lifecycle sample sets up her program documents. A project definition and requirements in Word, a solution blueprint, a data model, and a traceability workbook.",
    "dana3": "First, a traceability check. The Traceability Analyst reads every layer of the workbook, from business requirement to story.",
    "dana4": "Coverage for every layer, and a red status. Two stories marked ready would build the wrong thing. One builds a withdrawn requirement, and one still uses the old photo rule. It also catches a link to a requirement that does not exist, a story that skips design, and conflicting sources on S M S. Every finding has its cell reference and an owner.",
    "dana5": "Next, the guided lifecycle. Refine the requirements, then functional design, technical design, and stories, with an approval gate between every stage.",
    "dana6": "She names the run, picks the requirements and the project definition, and starts the first stage.",
    "dana7": "The Requirements Refiner works in its own chat, with the source documents already pinned, and saves its output to the project folder.",
    "dana8": "Thirty eight requirements, each with acceptance criteria and a source, all marked draft until approved. It spots the S M S conflict, follows the project definition, and lists the questions to take back to the business owner.",
    "dana9": "Before signing off, an advisory traceability check. It reports gaps, and never changes a file.",
    "dana10": "Dana approves. Her name and the time are stamped on the document, and the next stage unlocks. Send a stage back later, and everything downstream is flagged for review.",
    "close0": "Every thumbs up and down lands in Insights, so the team can see which assistants and quick starts are earning their keep. It all stays on this computer.",
    "close1":"Under the hood, Lumen drives the Claude command line, and it is pluggable. GitHub Copilot is one setting away.",
    "close2": "And every assistant and skill exports straight into V S Code, for the day you are ready for more.",
    "end": "Lumen. The power of A I agents, made friendly for everyone on the team.",
}


def make_voice():
    VO.mkdir(parents=True, exist_ok=True)
    book = VO / "made.json"
    made = json.loads(book.read_text(encoding="utf-8")) if book.exists() else {}
    engine = None
    lengths = {}
    for key, text in LINES.items():
        path = VO / f"{key}.wav"
        sig = hashlib.sha1(f"{VOICE}|{VOICE_SPEED}|{text}".encode()).hexdigest()
        if made.get(key) != sig or not path.exists():
            if engine is None:
                from kokoro_onnx import Kokoro
                engine = Kokoro(str(KOKORO / "kokoro-v1.0.onnx"), str(KOKORO / "voices-v1.0.bin"))
            audio, rate = engine.create(text, voice=VOICE, speed=VOICE_SPEED, lang="en-us")
            soundfile.write(str(path), audio, rate)
            made[key] = sig
            book.write_text(json.dumps(made, indent=1), encoding="utf-8")
            print("voice", key, flush=True)
        lengths[key] = soundfile.info(str(path)).duration
    return lengths


# ------------------------------------------------------------------ app server
def api(method, path, body=None):
    req = urllib.request.Request(f"http://localhost:{PORT}{path}", method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json", "Host": f"localhost:{PORT}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b"{}")


def start_server(mode, resume=False):
    shutil.rmtree(WORK / "data", ignore_errors=True)
    shutil.rmtree(WORKSPACE, ignore_errors=True)
    WORKSPACE.mkdir(parents=True)
    env = {**os.environ, "PORT": str(PORT), "LUMEN_DATA": str(WORK / "data")}
    if mode == "record":
        REC.parent.mkdir(parents=True, exist_ok=True)
        if resume:
            env["LUMEN_RECORD_RESUME"] = "1"  # keep what was recorded; only new requests reach the real engine
        else:
            if REC.exists():
                REC.unlink()
            shutil.rmtree(REC.parent / "artifacts", ignore_errors=True)
        env["LUMEN_RECORD"] = str(REC)
    else:
        env.update({"LUMEN_REPLAY": str(REC), "LUMEN_REPLAY_CPS": "1500", "LUMEN_REPLAY_STEP_MS": "650", "LUMEN_REPLAY_COMPLETE_MS": "1400"})
    import socket
    with socket.socket() as s:  # a stale server on this port would silently take every request
        if s.connect_ex(("127.0.0.1", PORT)) == 0:
            sys.exit(f"Port {PORT} is already in use. Stop whatever is listening there (or change PORT) and try again.")
    server = subprocess.Popen(["node", "server.js"], cwd=ROOT, env=env)
    for _ in range(60):
        if server.poll() is not None:
            sys.exit("The Lumen server exited during startup.")
        try:
            api("GET", "/api/status")
            break
        except Exception:
            time.sleep(0.25)
    api("PUT", "/api/settings", {"onboarded": True, "userName": "Marcus", "workspace": str(WORKSPACE), "access": "read", "model": "default", "theme": "light", "providerId": "claude-cli"})
    return server


# ------------------------------------------------------------------ director
class Director:
    def __init__(self, page, film, lengths):
        self.page, self.film, self.lengths = page, film, lengths
        self.events = []
        self.voice_end = 0

    def log(self, kind, **kw):
        self.events.append({"t": time.time(), "kind": kind, **kw})

    def wait(self, seconds):
        if seconds > 0:
            self.page.wait_for_timeout(seconds * 1000)

    def say(self, key):
        if not self.film:
            return
        self.wait_voice()
        self.log("voice", id=key)
        self.voice_end = time.time() + self.lengths[key]

    def wait_voice(self, pad=0.25):
        if self.film:
            self.wait(self.voice_end - time.time() + pad)

    def js(self, script, arg=None):
        return self.page.evaluate(script, arg)

    def center(self, target):
        loc = self.page.locator(target).first if isinstance(target, str) else target
        loc.wait_for(state="visible", timeout=30000)
        box = loc.bounding_box()
        if box["y"] < 0 or box["y"] + box["height"] > VIEW[1] or box["x"] < 0 or box["x"] + box["width"] > VIEW[0]:
            # Off screen: scroll it into view smoothly, like a person would, before pointing at it.
            loc.evaluate("el => el.scrollIntoView({ behavior: 'smooth', block: 'center' })")
            self.wait(0.9 if self.film else 0.4)
            box = loc.bounding_box()
        return loc, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2

    def hover(self, target, ms=750):
        _, x, y = self.center(target)
        self.js("([x, y, ms]) => Film.moveTo(x, y, ms)", [x, y, ms if self.film else 60])
        self.page.mouse.move(x, y)

    def click(self, target, ms=750, after=0.4):
        loc, x, y = self.center(target)
        self.js("([x, y, ms]) => Film.moveTo(x, y, ms)", [x, y, ms if self.film else 60])
        self.js("Film.press()")
        self.log("click")
        self.page.mouse.click(x, y)
        self.wait(after if self.film else 0.3)

    def type(self, text, delay=0.034):
        for ch in text:
            self.page.keyboard.type(ch)
            self.log("key")
            if self.film:
                self.wait(delay + random.uniform(-0.015, 0.03))

    def key(self, combo):
        self.log("click")
        self.page.keyboard.press(combo)

    def zoom(self, target, scale=1.6, ms=1100, pad=0):
        if not self.film:
            return
        sel = target if isinstance(target, str) else None
        self.js("""([sel, scale, ms, pad]) => { const el = document.querySelector(sel); if (!el) return;
            const r = Film.layoutRect(el); Film.zoom({ x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 }, scale, ms); }""", [sel, scale, ms, pad])
        self.log("whoosh", soft=True)
        self.wait(ms / 1000)

    def unzoom(self, ms=900):
        if not self.film:
            return
        self.js("ms => Film.unzoom(ms)", ms)
        self.log("whoosh", soft=True)
        self.wait(ms / 1000)

    def reveal(self, selector, block="center", wait=0.9):
        """Scroll the chat so an element is in view (smoothly)."""
        self.js("""([sel, block]) => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ behavior: 'smooth', block }); }""", [selector, block])
        self.wait(wait if self.film else 0.2)

    def card(self, html, persist=False, hold=0):
        self.js("([h, p]) => Film.card(h, { persist: p })", [html, persist])
        self.log("whoosh")
        self.wait(hold)

    def uncard(self, ms=800):
        self.js("ms => Film.uncard(ms)", ms)
        self.log("whoosh", soft=True)
        self.wait(ms / 1000)

    def third(self, html=None):
        self.js("h => Film.third(h)", html)

    def exists(self, selector):
        return bool(self.js("s => !!document.querySelector(s)", selector))

    def wait_for(self, check, timeout=600):
        """Poll a Python condition (e.g. the run API) until it holds."""
        end = time.time() + timeout
        while True:
            try:
                if check():
                    break
            except Exception:
                pass  # a transient API error while the run file is being written; just ask again
            if time.time() > end:
                raise TimeoutError("condition not met")
            self.page.wait_for_timeout(2000)
        self.wait(0.3)

    def replies(self):
        return self.js("document.querySelectorAll('.msg.assistant .msg-actions').length")

    def wait_reply(self, before, timeout=420):
        self.page.wait_for_function(
            "n => { const b = document.querySelector('#sendBtn'); return document.querySelectorAll('.msg.assistant .msg-actions').length > n && b && !b.classList.contains('stop'); }",
            arg=before, timeout=timeout * 1000, polling=250)
        self.wait(0.6)


# ------------------------------------------------------------------ the film
LOGO = '<svg viewBox="0 0 32 32"><path d="M16 4l2.6 7.4L26 14l-7.4 2.6L16 24l-2.6-7.4L6 14l7.4-2.6z" fill="#fff"/></svg>'


def persona_card(emoji, grad, name, role, need):
    return (f'<div class="avatar rise" style="background:{grad}">{emoji}</div>'
            f'<div class="kicker rise" style="animation-delay:.15s">{role}</div>'
            f'<h1 class="rise" style="animation-delay:.25s">Meet <em>{name}</em></h1>'
            f'<div class="need rise" style="animation-delay:.5s">🎯 {need}</div>')


def third_html(emoji, grad, name, role):
    return f'<div class="av" style="background:{grad}">{emoji}</div><div><b>{name}</b><span>{role}</span></div>'


MARCUS = ("🧭", "linear-gradient(135deg,#12a594,#3fc5e8)")
PRIYA = ("📋", "linear-gradient(135deg,#f59e0b,#f2643a)")
DANA = ("🧬", "linear-gradient(135deg,#7c5cff,#c757d6)")


def fresh_persona(page, name, settings=None):
    """Clear chats and custom assistants so each persona starts on a clean screen, then reload as them."""
    for c in api("GET", "/api/conversations"):
        api("DELETE", f"/api/conversations/{c['id']}")
    for a in api("GET", "/api/assistants"):
        if not a.get("builtin"):
            api("DELETE", f"/api/assistants/{a['id']}")
    api("PUT", "/api/settings", {"userName": name, **(settings or {})})
    page.evaluate("sessionStorage.filmHour = '14'")
    page.goto(f"http://localhost:{PORT}/")


def run_film(d):
    page = d.page
    page.evaluate("Film.hideCursor(true)")
    # Title
    d.card(f'<div class="logo rise">{LOGO}</div><h1 class="rise" style="animation-delay:.2s"><em>Lumen</em></h1>'
           f'<p class="rise" style="animation-delay:.45s">Claude-style AI for everyone at work</p>', hold=1.2)
    d.say("intro1")
    d.wait_voice()
    d.say("intro2")
    d.wait(1.5)
    d.uncard(1000)
    page.evaluate("Film.hideCursor(false)")
    d.wait_voice()

    # Overview
    d.zoom(".greeting", 1.35, 1200, pad=120)
    d.say("overview2")
    d.wait(1.2)
    d.unzoom(900)
    d.zoom(".assistant-row", 1.45, 1100, pad=40)
    for sel in ['[data-pick-assistant="requirements-coach"]', '[data-pick-assistant="schedule-analyst"]', '[data-pick-assistant="traceability-analyst"]']:
        d.hover(sel, 650)
        d.wait(0.35)
    d.unzoom(900)
    d.hover('.starter[data-go="runs"]', 700)
    d.wait_voice()

    # ---------------- Marcus
    d.card(persona_card(*MARCUS, "Marcus", "Business Analyst", "User stories for password reset, due Friday"))
    d.say("marcus1")
    d.wait_voice(0.4)
    d.uncard()
    d.third(third_html(*MARCUS, "Marcus", "Business Analyst"))
    d.say("marcus2")
    d.click('[data-pick-assistant="requirements-coach"]')
    d.wait(0.6)
    d.click('[data-starter^="Write user stories"]')
    d.wait(0.5)
    before = d.replies()
    d.click("#sendBtn")
    d.say("marcus3")
    d.wait_reply(before)
    d.wait_voice()
    d.reveal(".msg.assistant:last-child .md h2, .msg.assistant:last-child .md h3", "start", 1.0)
    d.zoom(".msg.assistant:last-child .md", 1.3, 1100)
    d.say("marcus4")
    d.js("() => { const m = document.querySelector('#messages'); m.scrollBy({ top: 520, behavior: 'smooth' }); }")
    d.wait(2.2)
    d.js("() => { const m = document.querySelector('#messages'); m.scrollBy({ top: 520, behavior: 'smooth' }); }")
    d.wait_voice()
    d.unzoom()

    # Reply actions: suggested next step, retry / branch / rate, save as Word
    if d.exists(".msg.assistant:last-child .suggest-chips"):
        d.reveal(".msg.assistant:last-child .suggest-chips", "center", 1.0)
        d.zoom(".msg.assistant:last-child .suggest-chips", 1.6, 900, pad=40)
        d.say("marcus_next")
        d.hover(".msg.assistant:last-child .suggest-chip", 700)
        d.wait_voice()
        d.unzoom(700)
    d.reveal(".msg.assistant:last-child .msg-actions", "center", 0.8)
    d.zoom(".msg.assistant:last-child .msg-actions", 1.7, 900, pad=40)
    d.say("marcus_actions")
    d.hover(".msg.assistant:last-child [data-retry]", 600)
    d.wait(0.4)
    d.hover(".msg.assistant:last-child [data-branch]", 600)
    d.wait(0.4)
    d.click(".msg.assistant:last-child [data-rate='up']", 600)
    d.wait_voice()
    d.say("marcus_word")
    d.click(".msg.assistant:last-child [data-save-as]", 600)
    d.wait(0.5)
    d.click('.menu-item:has-text("Word document")', 500)
    d.page.wait_for_selector(".msg.assistant:last-child .file-card", timeout=30000)
    d.unzoom(700)
    d.reveal(".msg.assistant:last-child .file-cards", "center", 0.9)
    d.zoom(".msg.assistant:last-child .file-cards", 1.8, 900, pad=40)
    d.wait_voice()
    d.unzoom()

    # Create an assistant
    d.click('.nav-item[data-nav="assistants"]')
    d.wait(0.8)
    d.say("marcus5")
    d.click(".page-head [data-new-assistant]")
    d.wait(0.6)
    d.click("#magicInput", 500)
    d.type("Helps me write clear UAT test scripts for our CRM rollout")
    d.click("#magicBtn")
    d.page.wait_for_function("() => { const b = document.querySelector('#magicBtn'); return b && !b.disabled; }", timeout=180000, polling=200)
    d.wait(0.4)
    d.zoom("#previewPane", 1.55, 1000, pad=30)
    d.say("marcus6")
    d.wait_voice()
    d.unzoom(700)
    d.js("() => document.querySelector('#fSkills')?.scrollIntoView({ behavior: 'smooth', block: 'center' })")
    d.wait(1.0)
    d.zoom("#fSkills", 1.4, 900, pad=20)
    d.wait(1.0)
    d.unzoom(700)
    d.click(".modal-foot .btn.grad")
    d.say("marcus7")
    d.wait(1.0)
    d.zoom(".assistant-row", 1.4, 900, pad=30)
    d.wait_voice()
    d.unzoom()
    d.third(None)

    # ---------------- Priya
    d.card(persona_card(*PRIYA, "Priya", "Project Manager", "Steering committee on Thursday"), persist=True)
    d.say("priya1")
    fresh_persona(page, "Priya")
    page.wait_for_selector(".demo-banner")
    d.wait_voice(0.4)
    d.uncard()
    d.third(third_html(*PRIYA, "Priya", "Project Manager"))
    d.say("priya2")
    d.click("[data-install-demo=\"crm\"]")
    d.wait(2.2)
    d.click("[data-open-drawer]")
    d.wait(1.0)
    d.zoom("#filesDrawer", 1.35, 1000)
    d.say("priya3")
    d.wait_voice()
    d.unzoom(700)
    d.click("[data-close-drawer]")

    # Health check
    d.click('.demo-actions [data-recipe="plan-health-check"]')
    d.wait(1.2)
    d.zoom('.modal [data-file-select="plan"]', 1.7, 900, pad=60)
    d.say("priya4")
    d.wait_voice()
    d.unzoom(600)
    before = d.replies()
    d.click(".modal-foot .btn.grad")
    d.wait(1.2)
    d.zoom(".msg.assistant:last-child", 1.5, 900, pad=40)
    d.say("priya5")
    d.wait_reply(before)
    d.unzoom(700)
    d.wait_voice()
    d.reveal(".msg.assistant:last-child .md table", "center", 1.0)
    d.zoom(".msg.assistant:last-child .md table", 1.35, 1000, pad=40)
    d.say("priya6")
    d.wait_voice()
    d.unzoom()

    # Copy table + repeat the check every Monday
    d.say("priya_repeat")
    d.hover(".msg.assistant:last-child .md .table-wrap", 600)
    d.wait(0.3)
    d.hover(".msg.assistant:last-child .md [data-copy-table]", 600)
    d.wait(1.2)
    d.click("#newChatBtn")
    d.wait(0.6)
    d.click('.demo-actions [data-recipe="plan-health-check"]')
    d.wait(1.0)
    d.click('.modal-foot button:has-text("Repeat")')
    d.page.wait_for_selector("#scheduleKind")
    d.wait(0.5)
    d.hover("#scheduleKind", 500)
    d.page.select_option("#scheduleKind", "weekly")
    d.log("click")
    d.wait(0.5)
    d.zoom(".modal:has(#scheduleKind)", 1.4, 900, pad=20)
    d.wait_voice()
    d.say("priya_weekly")
    d.hover('#scheduleDays label:has-text("Mon")', 600)
    d.wait(0.6)
    d.unzoom(600)
    d.click('.modal-foot button:has-text("Save schedule")')
    d.wait(0.8)
    d.click('.nav-item[data-nav="recipes"]')
    d.wait(0.6)
    d.click('[data-tab="Scheduled"]')
    d.wait(0.6)
    d.zoom(".schedule-list", 1.5, 900, pad=60)
    d.wait_voice()
    d.unzoom(700)

    # Update the plan from the progress workbook
    d.click("#newChatBtn")
    d.wait(0.8)
    d.click('.demo-actions [data-recipe="plan-update-progress"]')
    d.wait(1.2)
    d.zoom('.modal [data-file-select="progress"]', 1.6, 900, pad=80)
    d.say("priya7")
    d.wait(0.6)
    d.unzoom(600)
    d.click('.modal [data-field="status"]', 500)
    d.type("2026-10-30")
    d.wait_voice()
    before = d.replies()
    d.click(".modal-foot .btn.grad")
    d.say("priya8")
    d.wait(2.0)
    d.zoom(".msg.assistant:last-child .steps", 1.6, 800, pad=30)
    d.js("() => document.querySelector('.msg.assistant:last-child .steps-head')?.click()")
    d.wait_reply(before)
    d.wait_voice()
    d.unzoom(600)
    d.reveal(".msg.assistant:last-child .md table", "center", 1.0)
    d.zoom(".msg.assistant:last-child .md table", 1.35, 1000, pad=40)
    d.say("priya9")
    d.wait_voice()
    d.unzoom(700)
    d.reveal(".msg.assistant:last-child .file-cards", "center", 1.0)
    d.zoom(".msg.assistant:last-child .file-cards", 1.8, 900, pad=40)
    d.say("priya_diff")
    d.wait(0.4)
    d.unzoom(500)
    d.click(".msg.assistant:last-child [data-diff-file]")
    d.page.wait_for_selector(".modal .diff-table, .modal:has-text('File changes')", timeout=30000)
    d.wait(0.6)
    d.zoom(".modal", 1.3, 900, pad=20)
    d.wait_voice()
    d.wait(0.8)
    d.unzoom(600)
    d.click('.modal-foot button:has-text("Done")')

    # Excel tracker (edit access)
    d.say("priya12")
    d.click("#accessPill")
    d.wait(0.6)
    d.click('.menu-item:has-text("Create & edit files")')
    d.wait(0.8)
    d.click("#input", 500)
    d.type("Now turn the project plan into an Excel tracker with a Gantt chart.", 0.03)
    before = d.replies()
    d.key("Enter")
    d.wait(1.0)
    d.say("priya13")
    d.wait_reply(before)
    d.reveal(".msg.assistant:last-child .file-cards", "center", 1.0)
    d.zoom(".msg.assistant:last-child .file-cards", 1.8, 900, pad=40)
    d.wait_voice()
    d.unzoom()
    d.third(None)

    # ---------------- Dana: delivery lifecycle and traceability
    d.card(persona_card(*DANA, "Dana", "Delivery Lead", "Requirements to stories, fully traceable"), persist=True)
    d.say("dana1")
    fresh_persona(page, "Dana", {"workspace": str(WORKSPACE), "demoInstalled": "", "demoPack": "", "access": "read"})
    page.wait_for_selector('[data-install-demo="aidlc"]')
    d.wait_voice(0.4)
    d.uncard()
    d.third(third_html(*DANA, "Dana", "Delivery Lead"))
    d.click('[data-install-demo="aidlc"]')
    d.wait(2.2)
    d.click("[data-open-drawer]")
    d.wait(1.0)
    d.zoom("#filesDrawer", 1.35, 1000)
    d.say("dana2")
    d.wait_voice()
    d.unzoom(700)
    d.click("[data-close-drawer]")

    # Traceability check on the workbook
    d.click('.demo-actions [data-recipe="aidlc-trace-check"]')
    d.wait(1.2)
    d.zoom('.modal [data-file-select="trm"]', 1.7, 900, pad=60)
    d.say("dana3")
    d.wait(1.0)
    d.unzoom(600)
    before = d.replies()
    d.click(".modal-foot .btn.grad")
    d.wait(1.2)
    d.zoom(".msg.assistant:last-child", 1.5, 900, pad=40)
    d.wait_reply(before)
    d.unzoom(700)
    d.wait_voice()
    d.reveal(".msg.assistant:last-child .md table", "center", 1.0)
    d.zoom(".msg.assistant:last-child .md table", 1.3, 1000, pad=40)
    d.say("dana4")
    d.js("() => { const m = document.querySelector('#messages'); m.scrollBy({ top: 420, behavior: 'smooth' }); }")
    d.wait_voice()
    d.unzoom()
    d.reveal(".msg.assistant:last-child .msg-actions", "center", 0.6)
    d.click(".msg.assistant:last-child [data-rate='up']", 600)
    d.wait(0.6)

    # Guided lifecycle run
    d.click('.nav-item[data-nav="runs"]')
    d.wait(0.8)
    d.say("dana5")
    d.zoom(".page-inner", 1.25, 900, pad=20)
    d.wait(1.5)
    d.unzoom(600)
    d.click("#newRun")
    d.page.wait_for_selector("#runName")
    d.wait_voice()
    d.say("dana6")
    d.click("#runName", 500)
    d.type("Release 1")
    for name in ["BRD - Online Permit Renewal", "PID - Online Permit Renewal"]:
        d.click(f'.file-picker label:has-text("{name}") input', 600)
        d.wait(0.3)
    d.zoom(".modal", 1.25, 900, pad=20)
    d.wait(1.2)
    d.unzoom(600)
    d.click('.modal-foot button:has-text("Create run")')
    d.page.wait_for_selector(".run-stepper")
    d.wait(0.8)
    d.zoom(".run-stepper", 1.5, 900, pad=40)
    d.wait(0.8)
    d.unzoom(600)
    d.wait_voice()
    d.click('[data-run-action="start"]')
    d.say("dana7")
    run_id = page.evaluate("location.hash.split('run/')[1]")
    d.wait_for(lambda: api("GET", f"/api/runs/{run_id}")["stages"][0]["status"] in ("review", "rework"), 900)
    d.js("() => document.querySelector('.run-step.selected')?.click()")  # re-render: the page's own 2 s refresh stops after any failed request
    d.page.wait_for_selector('[data-run-action="approve"]', timeout=30000)
    d.wait_voice()

    # Look at the stage chat: pinned sources and the refined requirements
    d.click('[data-open-chat]')
    d.page.wait_for_selector(".msg.assistant .msg-actions")
    d.wait(0.6)
    d.zoom("#pinnedStrip", 1.6, 800, pad=30)
    d.wait(1.6)
    d.unzoom(600)
    d.reveal(".msg.assistant:last-child .md table, .msg.assistant:last-child .md h2", "center", 1.0)
    d.zoom(".msg.assistant:last-child .md", 1.25, 1000)
    d.say("dana8")
    d.js("() => { const m = document.querySelector('#messages'); m.scrollBy({ top: 420, behavior: 'smooth' }); }")
    d.wait_voice()
    d.unzoom()

    # Gate: advisory traceability check, then approve
    d.click('.nav-item[data-nav="runs"]')
    d.wait(0.6)
    d.click("[data-run]")
    d.page.wait_for_selector('[data-run-action="check"]')
    d.wait(0.5)
    d.say("dana9")
    d.click('[data-run-action="check"]')
    d.wait_for(lambda: not api("GET", f"/api/runs/{run_id}")["stages"][0].get("checkRunning"), 900)
    d.js("() => document.querySelector('.run-step.selected')?.click()")
    d.page.wait_for_selector(".run-findings", timeout=30000)
    d.wait(0.6)
    d.reveal(".run-findings", "start", 1.0)
    d.zoom(".run-findings", 1.25, 1000, pad=30)
    d.wait_voice()
    d.wait(1.5)
    d.unzoom(700)
    d.js("() => window.scrollTo({ top: 0, behavior: 'smooth' }) || document.querySelector('.run-actions')?.scrollIntoView({ behavior: 'smooth', block: 'center' })")
    d.wait(0.8)
    d.say("dana10")
    d.click('[data-run-action="approve"]')
    d.page.wait_for_selector('.page-inner p:has-text("Approved by")', timeout=30000)
    d.wait(0.6)
    d.zoom(".page-inner", 1.2, 900, pad=10)
    d.wait(2.2)
    d.unzoom(600)
    d.click('.run-step:nth-child(2)')
    d.wait(0.8)
    d.zoom(".page-inner", 1.2, 900, pad=10)
    d.wait_voice()
    d.unzoom(700)
    d.third(None)

    # Closing: insights, pluggable engines, VS Code
    d.click('.nav-item[data-nav="insights"]')
    d.page.wait_for_selector("#insightsBody table, #insightsBody .insights-empty", timeout=30000)
    d.wait(0.6)
    d.zoom("#insightsBody", 1.3, 1000, pad=20)
    d.say("close0")
    d.wait_voice()
    d.unzoom(600)
    d.click("#settingsBtn")
    d.wait(0.8)
    d.zoom("#providerCards", 1.5, 1000, pad=40)
    d.say("close1")
    d.wait_voice()
    d.unzoom(600)
    d.click(".modal-head [data-x]")
    d.click('.nav-item[data-nav="assistants"]')
    d.say("close2")
    d.wait(0.6)
    d.click('[data-assistant-menu="traceability-analyst"]')
    d.wait(0.5)
    d.click('.menu-item:has-text("Use in VS Code")')
    d.wait(1.0)
    d.zoom(".modal", 1.35, 900, pad=30)
    d.wait_voice()
    d.wait(0.6)
    d.unzoom(600)

    # End card
    page.evaluate("Film.hideCursor(true)")
    d.card(f'<div class="logo rise">{LOGO}</div><h1 class="rise" style="animation-delay:.2s"><em>Lumen</em></h1>'
           f'<p class="rise" style="animation-delay:.4s">The power of AI agents, made friendly for everyone on the team.</p>'
           f'<div class="pills rise" style="animation-delay:.7s"><span>💬 Chat-first</span><span>📅 Microsoft Project</span><span>📗 Excel &amp; Word</span>'
           f'<span>🧬 Guided lifecycle</span><span>🔗 Traceability</span><span>🕘 Scheduled checks</span><span>🔌 Claude · Copilot</span><span>🧩 Exports to VS Code</span></div>')
    d.say("end")
    d.wait_voice(1.6)


# ------------------------------------------------------------------ capture
class Capture:
    def __init__(self, page):
        self.page = page
        self.dir = WORK / "frames"
        shutil.rmtree(self.dir, ignore_errors=True)
        self.dir.mkdir(parents=True)
        self.frames = []
        self.cdp = page.context.new_cdp_session(page)
        self.on = True
        self.cdp.on("Page.screencastFrame", self.frame)

    def frame(self, f):
        if not self.on:
            return
        path = self.dir / f"{len(self.frames):06d}.jpg"
        path.write_bytes(base64.b64decode(f["data"]))
        self.frames.append((str(path), f["metadata"]["timestamp"]))
        try:
            self.cdp.send("Page.screencastFrameAck", {"sessionId": f["sessionId"]})
        except Exception:
            pass

    def start(self):
        self.cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92, "maxWidth": VIEW[0] * DSF, "maxHeight": VIEW[1] * DSF, "everyNthFrame": 1})

    def stop(self):
        self.page.wait_for_timeout(300)
        self.cdp.send("Page.stopScreencast")
        self.on = False


# ------------------------------------------------------------------ sound
def resample(audio, rate):
    if rate == RATE:
        return audio
    n = int(len(audio) * RATE / rate)
    return np.interp(np.arange(n) * rate / RATE, np.arange(len(audio)), audio).astype("float32")


def click_sound(rng):
    n = int(0.06 * RATE)
    t = np.arange(n) / RATE
    tick = rng.standard_normal(n) * np.exp(-t * 900) * 0.9
    tick = np.diff(tick, prepend=0)  # brighten
    thump = np.sin(2 * np.pi * 180 * t) * np.exp(-t * 90) * 0.35
    return (tick + thump).astype("float32")


def key_sound(rng):
    n = int(0.03 * RATE)
    t = np.arange(n) / RATE
    s = np.diff(rng.standard_normal(n), prepend=0) * np.exp(-t * 1400) * rng.uniform(0.18, 0.3)
    return s.astype("float32")


def whoosh(rng, soft=False):
    n = int((0.45 if soft else 0.8) * RATE)
    t = np.linspace(0, 1, n)
    noise = rng.standard_normal(n)
    # crude band-pass sweep: moving average of varying width
    acc = np.cumsum(noise)
    i = np.arange(n)
    lo = np.maximum(0, i - (40 - 34 * np.sin(np.pi * t)).astype(int))  # same as the old per-sample loop, vectorised
    out = (acc[i] - acc[lo]) / (i - lo + 1)
    env = np.sin(np.pi * t) ** 2
    return (out * env * (0.5 if soft else 0.9)).astype("float32")


def music(seconds, rng):
    """A gentle ambient bed: soft pad chords with a light arpeggio, 96 bpm."""
    n = int(seconds * RATE)
    t = np.arange(n) / RATE
    bed = np.zeros(n, dtype="float64")
    chords = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 67], [48, 52, 55, 59, 62], [55, 59, 62, 66, 69]]  # Am9 Fmaj9 Cmaj9 G6
    bar = 4 * 60 / 96 * 2  # two bars per chord
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)
    for k in range(int(seconds / bar) + 1):
        notes = chords[k % len(chords)]
        s0 = int(k * bar * RATE)
        s1 = min(n, int((k + 1) * bar * RATE + 1.5 * RATE))
        if s0 >= n:
            break
        tt = t[s0:s1] - t[s0]
        env = np.minimum(1, tt / 1.6) * np.minimum(1, np.maximum(0, (bar + 1.5 - tt) / 1.5))
        for m in notes:
            for det in (-0.08, 0.08):
                bed[s0:s1] += 0.022 * env * np.sin(2 * np.pi * hz(m) * (1 + det / 100) * tt)
        bed[s0:s1] += 0.03 * env * np.sin(2 * np.pi * hz(notes[0] - 12) * tt)
        # arpeggio, eighth notes
        step = 60 / 96 / 2
        for j in range(int(bar / step)):
            a0 = s0 + int(j * step * RATE)
            a1 = min(n, a0 + int(0.9 * RATE))
            if a0 >= n:
                break
            ta = t[a0:a1] - t[a0]
            m = notes[[0, 2, 4, 3, 1, 3, 4, 2][j % 8]] + 12
            bed[a0:a1] += 0.018 * np.exp(-ta * 5) * np.sin(2 * np.pi * hz(m) * ta) * (0.6 + 0.4 * rng.random())
    fade = np.minimum(1, np.minimum(t / 2.5, (seconds - t) / 3.5))
    return (bed * np.clip(fade, 0, 1)).astype("float32")


def build_audio(events, start, seconds, path):
    rng = np.random.default_rng(7)
    n = int(seconds * RATE) + RATE
    voice = np.zeros(n, dtype="float32")
    fx = np.zeros(n, dtype="float32")
    put = lambda track, at, clip, gain=1.0: track.__setitem__(slice(at, at + len(clip)), track[at:at + len(clip)] + clip[: max(0, n - at)] * gain)
    cues = []
    for e in events:
        at = int((e["t"] - start) * RATE)
        if at < 0 or at >= n:
            continue
        if e["kind"] == "voice":
            a, r = soundfile.read(str(VO / f"{e['id']}.wav"), dtype="float32")
            a = resample(a if a.ndim == 1 else a.mean(axis=1), r)
            put(voice, at, a)
            cues.append((e["t"] - start, e["t"] - start + len(a) / RATE, LINES[e["id"]]))
        elif e["kind"] == "click":
            put(fx, at, click_sound(rng), 0.55)
        elif e["kind"] == "key":
            put(fx, at, key_sound(rng), 0.5)
        elif e["kind"] == "whoosh":
            put(fx, at, whoosh(rng, e.get("soft")), 0.16 if e.get("soft") else 0.26)
    bed = np.resize(music(n / RATE, rng), n)  # n / RATE can round to one sample short
    # duck the bed under the voice
    env = np.abs(voice)
    k = int(0.25 * RATE)
    env = np.convolve(env, np.ones(k) / k, mode="same")
    duck = 1 - 0.55 * np.clip(env * 25, 0, 1)
    mix = voice * 1.0 + fx + bed[:n] * duck * 0.9
    stereo = np.stack([mix, mix], axis=1)
    soundfile.write(str(path), stereo, RATE)
    return cues


def write_srt(cues, path):
    def stamp(s):
        ms = int(s * 1000)
        return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"
    import re
    out, i = [], 0
    for a, b, text in cues:
        text = text.replace("V S Code", "VS Code").replace("A I", "AI").replace("C R M", "CRM").replace("raid", "RAID").replace("S M S", "SMS")
        parts = [p for p in re.split(r"(?<=[.?!])\s+", text) if p]
        total = sum(len(p) for p in parts)
        at = a
        for p in parts:
            end = at + (b - a) * len(p) / total
            i += 1
            out += [str(i), f"{stamp(at)} --> {stamp(end)}", p, ""]
            at = end
    path.write_text("\n".join(out), encoding="utf-8")


# ------------------------------------------------------------------ main
INIT = """
(() => { try { const h = Number(sessionStorage.filmHour || 9); Date.prototype.getHours = function () { return h; }; } catch {} })();
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--record", action="store_true")
    ap.add_argument("--resume", action="store_true", help="with --record: keep earlier recordings and only record what is missing")
    ap.add_argument("--voice", action="store_true")
    ap.add_argument("--stills", action="store_true")
    ap.add_argument("--keep-frames", action="store_true")
    ap.add_argument("--refinish", action="store_true", help="re-run only the edit (trim, audio, encode) from the last film's kept frames")
    args = ap.parse_args()

    if args.refinish:
        make_voice()
        saved = json.loads((WORK / "events.json").read_text(encoding="utf-8"))
        frames = [tuple(f) for f in saved.get("frame_list") or []]
        if not frames:  # older runs didn't save timestamps; the frames were written as they arrived, so file times are close
            files = sorted((WORK / "frames").glob("*.jpg"))
            frames = [(str(f), f.stat().st_mtime) for f in files]
        args.keep_frames = True
        finish(type("Cap", (), {"frames": frames})(), saved["events"], args)
        return

    lengths = make_voice() if not args.record else {k: 0 for k in LINES}
    if args.voice:
        total = 0
        for k, v in lengths.items():
            total += v
            print(f"{k:10} {v:5.1f}s")
        print(f"total narration {total:.0f}s")
        return

    from playwright.sync_api import sync_playwright
    mode = "record" if args.record else "film"
    server = start_server(mode, args.resume)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="msedge", headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--force-color-profile=srgb"])
            page = browser.new_page(viewport={"width": VIEW[0], "height": VIEW[1]}, device_scale_factor=DSF)
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.add_init_script(INIT)
            page.add_init_script(path=str(FILM / "overlay.js"))
            page.goto(f"http://localhost:{PORT}/")
            page.wait_for_selector(".greeting")
            page.wait_for_timeout(1500)
            d = Director(page, mode == "film", lengths)
            cap = None
            if mode == "film":
                cap = Capture(page)
                cap.start()
            started = time.time()
            run_film(d)
            if cap:
                cap.stop()
            browser.close()
            print("errors", errors, "took", round(time.time() - started), "s", flush=True)
    finally:
        server.terminate()

    if mode == "record":
        db = json.loads(REC.read_text(encoding="utf-8"))
        print("recorded runs", sum(len(v) for v in db["runs"].values()), "completes", sum(len(v) for v in db["completes"].values()))
        return

    finish(cap, d.events, args)


def trim_dead_air(frames, events, longest=3.0):
    """Cut any stretch where the screen froze (no new frames) for longer than `longest` seconds, unless narration is
    still playing, so a slow machine or a long wait never shows up as a frozen picture. Later frames and sounds move up."""
    voices = []
    for e in events:
        if e["kind"] == "voice":
            voices.append((e["t"], e["t"] + soundfile.info(str(VO / f"{e['id']}.wav")).duration))
    cuts = []  # (at, amount): everything at or after `at` moves earlier by `amount`
    for (_, a), (_, b) in zip(frames, frames[1:]):
        if b - a <= longest:
            continue
        talking = max([v1 for v0, v1 in voices if v0 < b and v1 > a] + [a])
        keep = max(longest, talking - a + 0.6)
        if b - a > keep + 0.5:
            cuts.append((a + keep, b - a - keep))
    if not cuts:
        return frames, events
    shift = lambda t: t - sum(n for at, n in cuts if t >= at + n) - sum(t - at for at, n in cuts if at <= t < at + n)
    print("trimmed dead air:", ", ".join(f"{n:.1f}s" for _, n in cuts), flush=True)
    return [(f, shift(t)) for f, t in frames], [{**e, "t": shift(e["t"])} for e in events]


def finish(cap, events, args):
    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    OUT.mkdir(parents=True, exist_ok=True)
    # The screencast sometimes delivers frames out of order. Put them back in capture order; otherwise each late
    # frame would play for a near-zero slot and the picture would slowly fall behind the sound (~20 s over 12 min).
    frames = sorted(cap.frames, key=lambda f: f[1])
    (WORK / "events.json").write_text(json.dumps({"start": frames[0][1], "events": events, "frames": len(frames), "frame_list": frames}, indent=1), encoding="utf-8")
    frames, events = trim_dead_air(frames, events)
    start = frames[0][1]
    end = max(frames[-1][1], max(e["t"] for e in events)) + 0.5
    seconds = end - start
    print(f"frames {len(frames)} over {seconds:.1f}s ({len(frames) / seconds:.1f} fps captured)", flush=True)

    if args.stills:
        picks = [frames[int(i * (len(frames) - 1) / 23)][0] for i in range(24)]
        inputs = sum([["-i", f] for f in picks], [])
        grid = f"{''.join(f'[{i}:v]scale=480:270[s{i}];' for i in range(24))}{''.join(f'[s{i}]' for i in range(24))}xstack=inputs=24:layout=" + "|".join(f"{(i % 6) * 480}_{(i // 6) * 270}" for i in range(24))
        subprocess.run([ffmpeg, "-y", "-loglevel", "error", *inputs, "-filter_complex", grid, str(OUT / "contact-sheet.jpg")], check=True)
        print("wrote", OUT / "contact-sheet.jpg")
        return

    listing = WORK / "frames.txt"
    with listing.open("w", encoding="utf-8") as f:
        for i, (path, ts) in enumerate(frames):
            nxt = frames[i + 1][1] if i + 1 < len(frames) else end
            f.write(f"file '{pathlib.Path(path).as_posix()}'\nduration {max(0.001, nxt - ts):.4f}\n")
        f.write(f"file '{pathlib.Path(frames[-1][0]).as_posix()}'\n")
    wav = WORK / "mix.wav"
    cues = build_audio(events, start, seconds, wav)
    write_srt(cues, OUT / f"{NAME}.srt")
    final = OUT / f"{NAME}.mp4"
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing), "-i", str(wav),
                    "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
                    "-movflags", "+faststart", "-shortest", str(final)], check=True)
    # thumbnail from the title card
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-ss", "3.5", "-i", str(final), "-frames:v", "1", "-q:v", "2", str(OUT / f"{NAME}-thumbnail.jpg")], check=True)
    print("wrote", final, round(final.stat().st_size / 1e6, 1), "MB", flush=True)
    if not args.keep_frames:
        shutil.rmtree(WORK / "frames", ignore_errors=True)


if __name__ == "__main__":
    main()
