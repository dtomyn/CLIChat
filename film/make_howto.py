"""Lumen how-to video: every feature, step by step, filmed from the real app. Same pipeline and style as make_video.py.

  python film/make_howto.py --record [--resume]   Run every new conversation once against the real AI engine (Claude Code) and save it.
  python film/make_howto.py --voice                Make the narration only and print each line's length.
  python film/make_howto.py                        Film (replaying the recording, shown as GitHub Copilot), mix and encode film/out/lumen-howto.mp4.
  python film/make_howto.py --stills               Film, then save a contact sheet instead of encoding.

The film presents Lumen running on GitHub Copilot (the Copilot CLI agent that also powers Copilot Chat in VS Code). Answers are recorded once with whichever engine is installed here
(Claude Code) and replayed: in replay mode every engine reports ready, so the UI shows GitHub Copilot as the selected engine.
Azure DevOps is the offline stand-in in film/ado-demo.js (ADO_MOCK), so Apply never touches a real organisation.
"""
import argparse
import json
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import make_video as mv  # noqa: E402

FILM = mv.FILM
REC = FILM / "recordings" / "howto-v2" / "recording.json"
SEED = FILM / "recordings" / "howto"  # answers recorded for the first how-to are reused when the request is identical
ADO_MOCK = FILM / "ado-demo.js"
NAME = "lumen-howto-v2"
TOTAL = 15

# ------------------------------------------------------------------ narration
LINES = {
    "intro1": "Welcome to Lumen. A friendly chat workspace, built on GitHub Copilot.",
    "intro2": "You may already chat with GitHub Copilot in V S Code. Behind the scenes, that chat now runs on the Copilot C L I agent. It reads your files, uses tools, and gets real work done. But V S Code is built around code, and most of the team works in plans, spreadsheets and documents.",
    "intro3": "Lumen runs on that same Copilot agent, in a chat window built for that kind of work, on your own computer. And yes, if Claude Code is what you have, Lumen runs on that too.",
    "intro4": "In the next few minutes, you'll learn how to use every part of it, step by step. Including what's new. Thirty nine specialist agents, more than seventy ready made prompts, sample projects for every discipline, and PowerPoint decks.",

    "t1": "Step one. Get set up.",
    "s1a": "The first time you open Lumen, it asks three things. Your name,",
    "s1b": "which A I engine to use. GitHub Copilot is ready, and Claude Code sits right beside it,",
    "s1c": "and where your work lives. That folder is your notebook. Keep it in OneDrive, and Microsoft 365 Copilot can find the same files later.",

    "t2": "Step two. Find your way around.",
    "s2a": "If you've used Microsoft 365 Copilot, this will feel familiar. That's on purpose.",
    "s2b": "The same rail on the left. Chat, Agents, Prompts, and your Notebook. The same words, and the same habits, so everything you learn here carries straight over when your Copilot licence arrives. Below them, Lumen adds a few of its own. Lifecycle runs, Insights, and Samples to practise on.",
    "s2c": "And so nobody mixes them up, every message box says plainly which tool you're in, and which engine is answering.",

    "t3": "Step three. Chat with an agent.",
    "s3a": "Agents are specialists. Pick one, like the Requirements Coach, and it offers starter prompts to get you going.",
    "s3b": "Under the message box, choose what Lumen may do. Just chat, read your files, or create and edit them. And pick a response mode, from quick to thorough.",
    "s3c": "Send it, and the answer streams in, with real headings and tables.",
    "s3d": "User stories, Given, When, Then acceptance criteria, and the open questions to take back to the business.",

    "t4": "Step four. Work with the reply.",
    "s4a": "Lumen suggests a next step. Click it to send, or press the up arrow to edit it first.",
    "s4b": "Every reply can be copied, retried, or branched into a new chat. A thumbs up or down tells the team what's working.",
    "s4c": "Need a document? Export the reply to Word, PowerPoint, or Markdown. Every heading becomes a slide, and replies with tables export to Excel too. Here, Word. Real headings, lists, and tables, saved straight into your notebook.",
    "s4d": "Your own messages can be edited and resent, or saved as a prompt to reuse any time.",

    "t5": "Step five. Bring in your files.",
    "s5a": "To practise, open Samples on the left. There are five made up projects, one for each kind of work. Use the P M demo. A Microsoft Project plan, with a budget, risks, and timesheets in Excel.",
    "s5b": "Lumen switches to the sample folder, and the home screen offers its best prompts. Open the Notebook to see everything in your project folder.",
    "s5c": "To use a file in a chat, type a slash, exactly like in Microsoft 365 Copilot, and pick it.",
    "s5d": "Lumen reads the real plan, and you can watch every step as it works.",

    "t6": "Step six. Use the prompt gallery.",
    "s6a": "The gallery now holds more than seventy saved prompts, in sixteen categories. Project plans, quality engineering, security, data, Azure DevOps, and more. Each one asks a few simple questions, then hands the work to the right agent.",
    "s6b": "Open the project health check. Lumen has already picked the right plan from your notebook. Click Start.",
    "s6c": "Red, amber or green, the critical path, slippage against the baseline, and who's over allocated.",
    "s6d": "And any table copies straight into Excel or Outlook.",

    "t7": "Step seven. Put it on repeat.",
    "s7a": "Open the prompt again, and choose Repeat. Daily, weekly, monthly, or every few minutes between two times, for a busy window like a cutover weekend. This one is weekly, Mondays at nine.",
    "s7b": "Scheduled prompts get their own tab. Lumen runs them while it's open, and leaves the result waiting as an unread chat.",

    "t8": "Step eight. Let Lumen update your files, safely.",
    "s8a": "Update the plan reads this week's progress workbook, and applies it to the Microsoft Project plan.",
    "s8b": "It never touches the original. It saves an updated copy, checks the schedule again, and lists every change.",
    "s8c": "See changes shows exactly what moved, task by task, before and after.",
    "s8d": "To create new files, switch the chat to Create and edit files. Ask for an Excel tracker with a Gantt chart,",
    "s8e": "and there it is, colour coded and ready for the steering committee.",

    "t9": "Step nine. Create your own agent.",
    "s9pre": "There are now thirty nine specialist agents. Search by name, by what they do, or by skill, and sort them however you like.",
    "s9a": "Can't find the right one? Create your own. Describe what you need in one sentence, and click Draft it.",
    "s9b": "Lumen fills in the same fields as Agent Builder in Microsoft 365 Copilot. Name, description, instructions, and starter prompts. It even switches on the right capabilities.",
    "s9c": "Anything marked Lumen only runs on this computer, so you always know what will carry over.",
    "s9d": "Create it, and pin your favourites to the sidebar.",

    "t10": "Step ten. Connect Azure DevOps.",
    "s10a": "In Settings, under Connections, paste your organisation's address. Lumen signs in with your Azure account, or an access token that it keeps encrypted.",
    "s10b": "Check the connection, then pick the project, the team, and the wikis to search.",
    "s10c": "Now agents like the Backlog Helper can search and read your work items and wiki pages.",
    "s10d": "And when an agent wants to change something, it only proposes. Switch the chat to Create and edit, and ask.",
    "s10e": "The change arrives as an approval card, showing exactly what will be written.",
    "s10f": "Nothing reaches Azure DevOps until you click Apply. Lumen checks that nobody changed it in the meantime, and records your name.",

    "t11": "Step eleven. Run a guided delivery lifecycle.",
    "s11a": "The lifecycle sample sets up a program's documents. Requirements and a project definition in Word, a solution blueprint, a data model, and a traceability workbook.",
    "s11b": "The traceability check reads every layer, from business requirement to story.",
    "s11c": "Coverage for every layer, stories that would build the wrong thing, broken links, and conflicting sources. Each one with a cell reference and an owner.",
    "s11d": "For bigger work, start a lifecycle run. Requirements, functional design, technical design, and stories, with an approval gate between every stage.",
    "s11e": "Name the run, choose the source documents, and start the first stage. Each stage works in its own chat, and saves its output to your notebook.",
    "s11f": "Before you sign off, run an advisory traceability check. It reports gaps, and never changes a file.",
    "s11g": "Then approve. Your name and the time are stamped on the output, and the next stage unlocks. With Azure DevOps connected, an approved stage publishes to the wiki, or becomes work items, in one click.",
    "s11h": "And any approved stage saves as a Word document, in the program's own template when it has one.",

    "t12": "Step twelve. Try the specialist samples.",
    "s12a": "Beyond plans and requirements, the other samples cover data, security, and change and training. Each one comes with its own agents.",
    "s12b": "Use the data sample. It has a source extract with data quality problems planted in it, and a data dictionary to check it against.",
    "s12c": "Profile a dataset. Pick the extract and the dictionary, and start.",
    "s12d": "The Data Profiler reports exactly what the code found. Every column profiled, and every rule break, with example rows.",
    "s12e": "And the findings are saved as a report, with scripts to run the same checks again in the data platform.",

    "t13": "Step thirteen. See what's working.",
    "s13": "Every thumbs up and down lands in Insights, by agent and by prompt. And it all stays on this computer.",

    "t14": "Step fourteen. Take it to Microsoft 365 Copilot.",
    "s14a": "When your Copilot licence arrives, export any agent. Paste it straight into Agent Builder, or hand I T a ready made app package.",
    "s14b": "Your prompts export too, as plain text, ready to save in Copilot's prompt gallery.",
    "s14c": "And every agent and skill exports into V S Code, so it works in GitHub Copilot Chat and Claude Code too.",
    "s14d": "For developers, Engineering packs save the developer, test automation, and pipeline agents into a code repository, so the whole team works to the same standards.",

    "t15": "Step fifteen. Make it yours.",
    "s15a": "Lumen is pluggable. It runs on GitHub Copilot, or on Claude Code, and switching is one click in Settings.",
    "s15b": "Light or dark, your choice.",
    "s15c": "And press control slash, for every keyboard shortcut.",

    "end": "Lumen. Built for GitHub Copilot, ready for Microsoft 365 Copilot, and friendly for everyone on the team.",
}

mv.LINES = LINES
mv.REC = REC
mv.NAME = NAME
mv.VO = FILM / "vo" / "howto"
PORT = mv.PORT
WORKSPACE = mv.WORKSPACE
api = mv.api


def write_srt(cues, path):
    import re
    fixes = {"V S Code": "VS Code", "A I": "AI", "C L I": "CLI", "I T ": "IT ", "C R M": "CRM", "P M demo": "PM demo"}

    def stamp(s):
        ms = int(s * 1000)
        return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"
    out, i = [], 0
    for a, b, text in cues:
        for k, v in fixes.items():
            text = text.replace(k, v)
        parts = [p for p in re.split(r"(?<=[.?!])\s+", text) if p]
        total = sum(len(p) for p in parts)
        at = a
        for p in parts:
            end = at + (b - a) * len(p) / total
            i += 1
            out += [str(i), f"{stamp(at)} --> {stamp(end)}", p, ""]
            at = end
    path.write_text("\n".join(out), encoding="utf-8")


mv.write_srt = write_srt


# ------------------------------------------------------------------ server
def start_server(mode, resume=False):
    shutil.rmtree(mv.WORK / "data", ignore_errors=True)
    shutil.rmtree(WORKSPACE, ignore_errors=True)
    WORKSPACE.mkdir(parents=True)
    env = {**os.environ, "PORT": str(PORT), "LUMEN_DATA": str(mv.WORK / "data"), "ADO_MOCK": str(ADO_MOCK)}
    if mode == "record":
        REC.parent.mkdir(parents=True, exist_ok=True)
        if not resume or not REC.exists():
            # Start from the explainer's recording: identical requests replay, only new ones reach the engine.
            shutil.rmtree(REC.parent, ignore_errors=True)
            shutil.copytree(SEED, REC.parent)
        env["LUMEN_RECORD_RESUME"] = "1"
        env["LUMEN_RECORD"] = str(REC)
    else:
        env.update({"LUMEN_REPLAY": str(REC), "LUMEN_REPLAY_CPS": "1500", "LUMEN_REPLAY_STEP_MS": "650", "LUMEN_REPLAY_COMPLETE_MS": "1400"})
    with socket.socket() as s:
        if s.connect_ex(("127.0.0.1", PORT)) == 0:
            sys.exit(f"Port {PORT} is already in use.")
    server = subprocess.Popen(["node", "server.js"], cwd=mv.ROOT, env=env)
    for _ in range(60):
        if server.poll() is not None:
            sys.exit("The Lumen server exited during startup.")
        try:
            api("GET", "/api/status")
            break
        except Exception:
            time.sleep(0.25)
    # First run: onboarding shows. Filming selects GitHub Copilot; recording needs the engine that is really installed.
    api("PUT", "/api/settings", {"onboarded": False, "userName": "", "workspace": str(WORKSPACE), "access": "read", "model": "default",
                                 "theme": "light", "providerId": "claude-cli" if mode == "record" else "copilot-cli"})
    return server


# ------------------------------------------------------------------ the film
LOGO = mv.LOGO


def step(d, n, title, key):
    d.third(None)
    d.card(f'<div class="stepnum rise">{n}</div><div class="kicker rise" style="animation-delay:.12s">How to</div>'
           f'<h1 class="rise" style="animation-delay:.22s"><em>{title}</em></h1>')
    d.say(key)
    d.wait_voice(0.2)
    d.uncard(700)
    d.third(f'<div class="num">{n}</div><div><b>{title}</b><span>Step {n} of {TOTAL}</span></div>')


def scroll_msgs(d, px):
    d.js(f"() => document.querySelector('#messages')?.scrollBy({{ top: {px}, behavior: 'smooth' }})")


# A stylised VS Code window with the GitHub Copilot Chat panel: where the team already talks to Copilot today.
VSCODE = ('<div class="vsc rise"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>'
          '<b>Contoso CRM Migration · Visual Studio Code</b></div><div class="cols">'
          '<div class="ex"><div class="h">Explorer</div><div>📁 plans</div><div class="on">📄 Contoso CRM Migration.xml</div><div>📊 Budget tracker.xlsx</div>'
          '<div>📊 RAID log.xlsx</div><div>📝 Status report.docx</div><div>📁 .github</div></div>'
          '<div class="ed">&lt;<b>Task</b>&gt;\n  &lt;<b>UID</b>&gt;21&lt;/<b>UID</b>&gt;\n  &lt;<b>Name</b>&gt;<s>Data cleansing</s>&lt;/<b>Name</b>&gt;\n'
          '  &lt;<b>Start</b>&gt;<s>2026-09-28T08:00:00</s>&lt;/<b>Start</b>&gt;\n  &lt;<b>Finish</b>&gt;<s>2026-10-14T17:00:00</s>&lt;/<b>Finish</b>&gt;\n'
          '  &lt;<b>PercentComplete</b>&gt;<s>80</s>&lt;/<b>PercentComplete</b>&gt;\n  &lt;<b>Critical</b>&gt;<s>1</s>&lt;/<b>Critical</b>&gt;\n'
          '  &lt;<b>Baseline</b>&gt;\n    &lt;<b>Finish</b>&gt;<s>2026-10-01T17:00:00</s>&lt;/<b>Finish</b>&gt;\n  &lt;/<b>Baseline</b>&gt;\n&lt;/<b>Task</b>&gt;\n…</div>'
          '<div class="chat"><div class="t">Chat · GitHub Copilot · Agent</div>'
          '<div class="u ln" style="animation-delay:.8s">Check the CRM migration plan and flag anything slipping</div>'
          '<div class="d ln" style="animation-delay:2.0s">✓ Read Contoso CRM Migration.xml</div>'
          '<div class="d ln" style="animation-delay:2.7s">✓ Ran the schedule health check</div>'
          '<div class="d ln" style="animation-delay:3.4s">✓ Compared against the baseline</div>'
          '<div class="a ln" style="animation-delay:4.4s">Go-live has slipped 10 working days, and the critical path has no float left…</div>'
          '<div class="in">Ask Copilot</div></div></div></div>')


def run_howto(d):
    page = d.page
    film = d.film
    page.evaluate("Film.hideCursor(true)")

    # ---------------- Opening: built on GitHub Copilot, the same agent the team uses in VS Code
    d.card(f'<div class="logo rise">{LOGO}</div><div class="kicker rise" style="animation-delay:.15s">How-to guide</div>'
           f'<h1 class="rise" style="animation-delay:.25s"><em>Lumen</em></h1>'
           f'<p class="rise" style="animation-delay:.45s">Built on GitHub Copilot</p>'
           f'<div class="pills rise" style="animation-delay:.75s"><span>🐙 GitHub Copilot</span><span>🟣 Claude Code too</span><span>🪟 Feels like Microsoft 365 Copilot</span></div>', hold=1.0)
    d.say("intro1")
    d.wait_voice(0.3)
    d.card(VSCODE)
    d.say("intro2")
    d.wait_voice(0.3)
    d.card(f'<div class="logo rise">{LOGO}</div><h1 class="rise" style="animation-delay:.2s">Same Copilot. <em>Built for your work.</em></h1>'
           f'<p class="rise" style="animation-delay:.5s">Plans, spreadsheets and documents · on your own computer · GitHub Copilot or Claude Code</p>')
    d.say("intro3")
    d.wait_voice()
    d.say("intro4")
    d.wait(1.2)
    d.wait_voice()

    # ---------------- 1. Get set up
    step(d, 1, "Get set up", "t1")
    page.evaluate("Film.hideCursor(false)")
    page.wait_for_selector("#obName")
    d.zoom(".modal", 1.45, 1000, pad=30)
    d.say("s1a")
    d.click("#obName", 600)
    d.type("Alex")
    d.wait_voice()
    d.unzoom(600)
    d.click(".modal-foot [data-next]")
    page.wait_for_selector("#obProviders")
    d.zoom("#obProviders", 1.7, 900, pad=40)
    d.say("s1b")
    if film:
        d.click('#obProviders [data-provider="copilot-cli"]', 600)
    d.hover('#obProviders [data-provider="claude-cli"]', 600)
    d.wait_voice()
    d.unzoom(600)
    d.click(".modal-foot [data-next]")
    page.wait_for_selector("#obFolderBtn")
    d.zoom(".modal", 1.3, 900, pad=20)
    d.say("s1c")
    d.wait_voice()
    d.unzoom(600)
    d.click(".modal-foot [data-next]")
    d.wait(1.6)
    if not film:  # recording runs on the engine that is really installed
        api("PUT", "/api/settings", {"providerId": "claude-cli"})
        page.goto(f"http://localhost:{PORT}/")
    page.wait_for_selector(".greeting")

    # ---------------- 2. Find your way around
    step(d, 2, "Find your way around", "t2")
    d.zoom(".greeting", 1.35, 1100, pad=140)
    d.say("s2a")
    d.wait_voice()
    d.unzoom(700)
    d.zoom(".rail", 2.2, 1000, pad=10)
    d.say("s2b")
    for sel in ['.rail [data-nav="home"].rail-item', '.rail [data-nav="assistants"]', '.rail [data-nav="recipes"]', "#filesNavBtn"]:
        d.hover(sel, 550)
        d.wait(0.45)
    d.wait(2.4)
    for sel in ['.rail [data-nav="runs"]', '.rail [data-nav="insights"]', '.rail [data-nav="samples"]']:
        d.hover(sel, 550)
        d.wait(0.45)
    d.wait_voice()
    d.unzoom(700)
    d.zoom(".composer-hint", 2.0, 1000, pad=30)
    d.say("s2c")
    d.wait_voice()
    d.unzoom(700)

    # ---------------- 3. Chat with an agent
    step(d, 3, "Chat with an agent", "t3")
    d.say("s3a")
    d.click('[data-pick-assistant="requirements-coach"]')
    d.wait(0.8)
    d.zoom(".prompt-chips", 1.5, 900, pad=40)
    d.wait(0.6)
    d.click('[data-starter^="Write user stories"]', 600)
    d.wait_voice()
    d.unzoom(600)
    d.zoom(".composer", 1.6, 900, pad=30)
    d.say("s3b")
    d.hover("#accessPill", 600)
    d.wait(0.6)
    if d.exists("#modelPill"):
        d.hover("#modelPill", 600)
        d.wait(0.6)
    d.unzoom(600)
    # Menus are placed in page coordinates, so open them with the camera at rest.
    close_menu = "() => document.dispatchEvent(new MouseEvent('mousedown'))"
    d.click("#accessPill", 600)
    d.wait(1.8)
    d.js(close_menu)
    if d.exists("#modelPill"):
        d.click("#modelPill", 600)
        d.wait(1.6)
        d.js(close_menu)
    d.wait_voice()
    before = d.replies()
    d.click("#sendBtn")
    d.say("s3c")
    d.wait_reply(before)
    d.wait_voice()
    d.reveal(".msg.assistant:last-child .md h2, .msg.assistant:last-child .md h3", "start", 1.0)
    d.zoom(".msg.assistant:last-child .md", 1.3, 1100)
    d.say("s3d")
    scroll_msgs(d, 520)
    d.wait(2.2)
    scroll_msgs(d, 520)
    d.wait_voice()
    d.unzoom()

    # ---------------- 4. Work with the reply
    step(d, 4, "Work with the reply", "t4")
    if d.exists(".msg.assistant:last-child .suggest-chips"):
        d.reveal(".msg.assistant:last-child .suggest-chips", "center", 1.0)
        d.zoom(".msg.assistant:last-child .suggest-chips", 1.6, 900, pad=40)
        d.say("s4a")
        d.hover(".msg.assistant:last-child .suggest-chip", 700)
        d.wait_voice()
        d.unzoom(700)
    d.reveal(".msg.assistant:last-child .msg-actions", "center", 0.8)
    d.zoom(".msg.assistant:last-child .msg-actions", 1.7, 900, pad=40)
    d.say("s4b")
    for sel in ["[data-copy-msg]", "[data-retry]", "[data-branch]"]:
        d.hover(f".msg.assistant:last-child {sel}", 550)
        d.wait(0.35)
    d.click(".msg.assistant:last-child [data-rate='up']", 600)
    d.wait_voice()
    d.unzoom(600)
    d.say("s4c")
    d.click(".msg.assistant:last-child [data-save-as]", 600)
    d.wait(0.7)
    d.zoom(".menu", 1.5, 800, pad=30)
    for label in ["Excel workbook", "PowerPoint deck", "Markdown"]:
        if page.locator(f'.menu-item:has-text("{label}")').count():
            d.hover(f'.menu-item:has-text("{label}")', 500)
            d.wait(0.6)
    d.wait(1.0)
    d.unzoom(500)
    d.click('.menu-item:has-text("Word document")', 500)
    page.wait_for_selector(".msg.assistant:last-child .file-card", timeout=30000)
    d.reveal(".msg.assistant:last-child .file-cards", "center", 0.9)
    d.zoom(".msg.assistant:last-child .file-cards", 1.8, 900, pad=40)
    d.wait_voice()
    d.unzoom(700)
    d.reveal(".msg.user", "center", 0.9)
    d.hover(".msg.user .bubble", 500)
    d.zoom(".msg.user", 1.6, 900, pad=40)
    d.say("s4d")
    d.hover(".msg.user [data-edit-msg]", 550)
    d.wait(0.5)
    d.hover(".msg.user [data-save-recipe]", 550)
    d.wait_voice()
    d.unzoom(700)

    # ---------------- 5. Bring in your files
    step(d, 5, "Bring in your files", "t5")
    d.click('.rail [data-nav="samples"]')
    d.wait(0.8)
    d.zoom(".card-grid", 1.2, 900, pad=20)
    d.say("s5a")
    d.hover('.sample-card:has([data-install-demo="crm"])', 600)
    d.wait(1.0)
    d.wait_voice(-2.5)
    d.unzoom(600)
    d.click('[data-install-demo="crm"]', 600)
    page.wait_for_selector(".demo-banner.active", timeout=30000)
    d.wait(1.0)
    d.wait_voice()
    d.zoom(".demo-banner", 1.45, 900, pad=30)
    d.say("s5b")
    d.wait(2.6)
    d.unzoom(600)
    d.click("#filesNavBtn")
    d.wait(1.0)
    d.zoom("#filesDrawer", 1.35, 1000)
    d.wait_voice()
    d.unzoom(700)
    d.click("[data-close-drawer]")
    d.wait(0.4)
    d.click("#input", 500)
    d.type("Which tasks are running late, and who owns them? Keep it short. ", 0.03)
    d.say("s5c")
    d.type("/Contoso", 0.09)
    page.wait_for_selector(".mention-menu .menu-item", timeout=15000)
    d.wait(0.5)
    d.zoom(".composer", 1.5, 800, pad=120)
    d.wait(1.0)
    d.key("Enter")
    d.wait(0.6)
    d.wait_voice()
    d.unzoom(600)
    before = d.replies()
    d.key("Enter")
    d.say("s5d")
    d.wait(1.6)
    if d.exists(".msg.assistant:last-child .steps"):
        d.js("() => document.querySelector('.msg.assistant:last-child .steps-head')?.click()")
        d.zoom(".msg.assistant:last-child", 1.4, 800, pad=40)
    d.wait_reply(before)
    d.wait_voice()
    d.unzoom(600)
    d.reveal(".msg.assistant:last-child .md", "start", 1.0)
    d.zoom(".msg.assistant:last-child .md", 1.3, 1000)
    d.wait(2.8)
    d.unzoom(700)

    # ---------------- 6. Prompt gallery
    step(d, 6, "Use the prompt gallery", "t6")
    d.click('.nav-item[data-nav="recipes"]')
    d.wait(0.8)
    d.zoom(".tabs", 1.5, 900, pad=40)
    d.say("s6a")
    for tab in ["Project plans", "Quality engineering", "Security", "Data", "Azure DevOps"]:
        d.click(f'[data-tab="{tab}"]', 550)
        d.wait(0.7)
    d.click('[data-tab="Project plans"]', 550)
    d.wait_voice()
    d.unzoom(600)
    d.click('.recipe-grid [data-recipe="plan-health-check"]')
    d.wait(1.2)
    d.zoom('.modal [data-file-select="plan"]', 1.7, 900, pad=60)
    d.say("s6b")
    d.wait_voice()
    d.unzoom(600)
    before = d.replies()
    d.click('.modal-foot button:has-text("Start")')
    d.wait(1.2)
    d.wait_reply(before)
    d.reveal(".msg.assistant:last-child .md table", "center", 1.0)
    d.zoom(".msg.assistant:last-child .md table", 1.35, 1000, pad=40)
    d.say("s6c")
    d.wait_voice()
    d.unzoom(700)
    d.say("s6d")
    d.hover(".msg.assistant:last-child .md .table-wrap", 600)
    d.wait(0.3)
    d.click(".msg.assistant:last-child .md [data-copy-table]", 600)
    d.wait_voice()

    # ---------------- 7. Schedule
    step(d, 7, "Put it on repeat", "t7")
    d.click('.nav-item[data-nav="recipes"]')
    d.wait(0.6)
    d.click('.recipe-grid [data-recipe="plan-health-check"]')
    d.wait(1.0)
    d.say("s7a")
    d.click('.modal-foot button:has-text("Repeat")')
    page.wait_for_selector("#scheduleKind")
    d.wait(0.5)
    d.hover("#scheduleKind", 500)
    d.zoom(".modal:has(#scheduleKind)", 1.4, 900, pad=20)
    page.select_option("#scheduleKind", "interval")
    d.log("click")
    d.wait(3.2)
    page.select_option("#scheduleKind", "weekly")
    d.log("click")
    d.wait(0.5)
    d.hover('#scheduleDays label:has-text("Mon")', 600)
    d.wait_voice()
    d.unzoom(600)
    d.click('.modal-foot button:has-text("Save schedule")')
    d.wait(0.8)
    d.click('[data-tab="Scheduled"]')
    d.wait(0.6)
    d.zoom(".schedule-list", 1.5, 900, pad=60)
    d.say("s7b")
    d.wait_voice()
    d.unzoom(700)

    # ---------------- 8. Update files safely
    step(d, 8, "Let Lumen update your files", "t8")
    d.click("#newChatBtn")
    d.wait(0.8)
    d.click('.demo-actions [data-recipe="plan-update-progress"]')
    d.wait(1.2)
    d.zoom('.modal [data-file-select="progress"]', 1.6, 900, pad=80)
    d.say("s8a")
    d.wait(0.6)
    d.unzoom(600)
    d.click('.modal [data-field="status"]', 500)
    d.type("2026-10-30")
    d.wait_voice()
    before = d.replies()
    d.click(".modal-foot .btn.grad")
    d.say("s8b")
    d.wait(2.0)
    d.zoom(".msg.assistant:last-child .steps", 1.6, 800, pad=30)
    d.js("() => document.querySelector('.msg.assistant:last-child .steps-head')?.click()")
    d.wait_reply(before)
    d.wait_voice()
    d.unzoom(600)
    d.reveal(".msg.assistant:last-child .md table", "center", 1.0)
    d.zoom(".msg.assistant:last-child .md table", 1.35, 1000, pad=40)
    d.wait(2.4)
    d.unzoom(700)
    d.reveal(".msg.assistant:last-child .file-cards", "center", 1.0)
    d.zoom(".msg.assistant:last-child .file-cards", 1.8, 900, pad=40)
    d.say("s8c")
    d.wait(0.4)
    d.unzoom(500)
    d.wait(0.6)
    d.click(".msg.assistant:last-child [data-diff-file]")
    try:
        page.wait_for_selector(".modal .diff-table, .modal:has-text('File changes')", timeout=6000)
    except Exception:  # the chat was still scrolling when the cursor arrived
        d.js("() => document.querySelector('.msg.assistant:last-child [data-diff-file]').click()")
        page.wait_for_selector(".modal .diff-table, .modal:has-text('File changes')", timeout=30000)
    d.wait(0.6)
    d.zoom(".modal", 1.3, 900, pad=20)
    d.wait_voice()
    d.wait(0.6)
    d.unzoom(600)
    d.click('.modal-foot button:has-text("Done")')
    d.say("s8d")
    d.click("#accessPill")
    d.wait(0.6)
    d.click('.menu-item:has-text("Create & edit files")')
    d.wait(0.8)
    d.click("#input", 500)
    d.type("Now turn the project plan into an Excel tracker with a Gantt chart.", 0.03)
    before = d.replies()
    d.key("Enter")
    d.wait(1.0)
    d.wait_voice()
    d.say("s8e")
    d.wait_reply(before)
    d.reveal(".msg.assistant:last-child .file-cards", "center", 1.0)
    d.zoom(".msg.assistant:last-child .file-cards", 1.8, 900, pad=40)
    d.wait_voice()
    d.unzoom()

    # ---------------- 9. Create an agent
    step(d, 9, "Create your own agent", "t9")
    d.click('.nav-item[data-nav="assistants"]')
    d.wait(0.8)
    d.zoom(".agent-toolbar", 1.6, 900, pad=30)
    d.say("s9pre")
    d.click("#agentSearch", 500)
    d.type("test", 0.12)
    d.wait(1.6)
    d.unzoom(600)
    d.zoom(".page-inner", 1.15, 800, pad=10)
    d.wait(1.6)
    d.unzoom(600)
    d.hover("#agentSort", 600)
    d.wait_voice()
    d.click("#agentSearch", 400)
    d.key("Escape")
    d.wait(0.6)
    d.click(".page-head [data-new-assistant]")
    d.wait(0.6)
    d.say("s9a")
    d.click("#magicInput", 500)
    d.type("Helps me write clear UAT test scripts for our CRM rollout")
    d.click("#magicBtn")
    page.wait_for_function("() => { const b = document.querySelector('#magicBtn'); return b && !b.disabled; }", timeout=180000, polling=200)
    d.wait(0.4)
    d.wait_voice()
    d.zoom("#previewPane", 1.55, 1000, pad=30)
    d.say("s9b")
    d.wait_voice()
    d.unzoom(700)
    d.js("() => document.querySelector('#fSkills')?.scrollIntoView({ behavior: 'smooth', block: 'center' })")
    d.wait(1.0)
    d.zoom("#fSkills", 1.4, 900, pad=40)
    d.say("s9c")
    d.wait_voice()
    d.unzoom(700)
    d.click(".modal-foot .btn.grad")
    d.say("s9d")
    d.wait(1.2)
    d.click('.nav-item[data-nav="assistants"]')
    d.wait(0.8)
    mine = [a["id"] for a in api("GET", "/api/assistants") if not a.get("builtin")]
    d.click(f'[data-assistant-menu="{mine[-1]}"]')
    d.wait(0.5)
    d.click('.menu-item:has-text("Pin to sidebar")')
    d.wait(0.8)
    d.zoom("#agentList", 2.0, 900, pad=30)
    d.wait_voice()
    d.unzoom(700)

    # ---------------- 10. Azure DevOps
    step(d, 10, "Connect Azure DevOps", "t10")
    d.click("#settingsBtn")
    d.wait(0.8)
    d.click("#sAdo")
    page.wait_for_selector("#adoOrg")
    d.wait(0.5)
    d.zoom(".modal", 1.3, 900, pad=20)
    d.say("s10a")
    d.click("#adoOrg", 500)
    d.type("https://dev.azure.com/contoso", 0.04)
    if d.exists('#adoAuth [data-v="pat"]:not([disabled])') and not d.exists("#adoPatRemove"):
        d.click('#adoAuth [data-v="pat"]', 500)
        d.click("#adoPatInput", 500)
        d.type("filmdemotoken0000000000000000000000000000000000", 0.012)
        d.click("#adoPatSave", 500)
        d.wait(1.0)
    d.wait_voice()
    d.say("s10b")
    if not d.exists("#adoProject"):
        d.click("#adoCheck", 500)
    page.wait_for_selector("#adoProject", timeout=30000)
    d.wait(0.5)
    d.hover("#adoProject", 500)
    page.select_option("#adoProject", "Permit Renewal")
    d.log("click")
    page.wait_for_selector("#adoTeam", timeout=30000)
    d.wait(0.6)
    d.hover("#adoTeam", 500)
    page.select_option("#adoTeam", "Permit Renewal Team")
    d.log("click")
    d.wait(0.4)
    d.click('#adoWikis input[value="Permit-Renewal.wiki"]', 500)
    d.wait_voice()
    d.unzoom(600)
    d.click('.modal-foot button:has-text("Save")')
    d.wait(1.0)
    d.click("#newChatBtn")
    d.wait(0.8)
    d.say("s10c")
    d.click('[data-pick-assistant="backlog-helper"]')
    d.wait(0.8)
    d.click('[data-starter^="How is the current sprint"]', 600)
    before = d.replies()
    d.click("#sendBtn")
    d.wait_reply(before)
    d.wait_voice()
    d.reveal(".msg.assistant:last-child .md table, .msg.assistant:last-child .md h2", "center", 1.0)
    d.zoom(".msg.assistant:last-child .md", 1.3, 1000)
    d.wait(2.6)
    d.unzoom(700)
    d.say("s10d")
    d.click("#accessPill")
    d.wait(0.6)
    d.click('.menu-item:has-text("Create & edit files")')
    d.wait(0.8)
    d.click("#input", 500)
    d.type("Add a story under feature #210 so citizens can download a PDF receipt after paying. Tag it FD-012, 2 story points, Sprint 5, with Given/When/Then acceptance criteria.", 0.022)
    before = d.replies()
    d.key("Enter")
    d.wait_voice()
    d.wait_reply(before)
    page.wait_for_selector(".msg.assistant:last-child .approval-card [data-ap-apply]", timeout=60000)
    d.wait(0.6)
    d.reveal(".msg.assistant:last-child .approval-card", "center", 1.0)
    d.zoom(".msg.assistant:last-child .approval-card", 1.35, 1000, pad=30)
    d.say("s10e")
    d.wait_voice()
    d.say("s10f")
    d.click(".msg.assistant:last-child [data-ap-apply]", 700)
    page.wait_for_selector(".msg.assistant:last-child .approval-card .ap-result", timeout=30000)
    d.wait(0.8)
    d.zoom(".msg.assistant:last-child .approval-card", 1.35, 900, pad=30)
    d.wait_voice()
    d.unzoom(700)

    # ---------------- 11. Lifecycle
    d.third(None)
    d.card(f'<div class="stepnum rise">11</div><div class="kicker rise" style="animation-delay:.12s">How to</div>'
           f'<h1 class="rise" style="animation-delay:.22s"><em>Run a guided lifecycle</em></h1>', persist=True)
    d.say("t11")
    api("PUT", "/api/settings", {"workspace": str(WORKSPACE), "access": "read", "demoInstalled": "", "demoPack": ""})
    page.goto(f"http://localhost:{PORT}/#samples")
    page.reload()  # only the hash changed, so goto alone keeps the old settings in the page
    page.wait_for_selector('[data-install-demo="aidlc"]')
    d.wait_voice(0.2)
    d.uncard(700)
    d.third(f'<div class="num">11</div><div><b>Run a guided lifecycle</b><span>Step 11 of {TOTAL}</span></div>')
    d.click('[data-install-demo="aidlc"]')
    page.wait_for_selector(".demo-banner.active", timeout=30000)
    d.wait(1.2)
    d.click(".demo-banner [data-open-drawer]")
    d.wait(1.0)
    d.zoom("#filesDrawer", 1.35, 1000)
    d.say("s11a")
    d.wait_voice()
    d.unzoom(700)
    d.click("[data-close-drawer]")
    d.click('.demo-actions [data-recipe="aidlc-trace-check"]')
    d.wait(1.2)
    d.zoom('.modal [data-file-select="trm"]', 1.7, 900, pad=60)
    d.say("s11b")
    d.wait(1.0)
    d.unzoom(600)
    before = d.replies()
    d.click(".modal-foot .btn.grad")
    d.wait(1.2)
    d.wait_reply(before)
    d.wait_voice()
    d.reveal(".msg.assistant:last-child .md table", "center", 1.0)
    d.zoom(".msg.assistant:last-child .md table", 1.3, 1000, pad=40)
    d.say("s11c")
    scroll_msgs(d, 420)
    d.wait_voice()
    d.unzoom()
    d.reveal(".msg.assistant:last-child .msg-actions", "center", 0.6)
    d.click(".msg.assistant:last-child [data-rate='up']", 600)
    d.wait(0.5)

    d.click('.nav-item[data-nav="runs"]')
    d.wait(0.8)
    d.say("s11d")
    d.zoom(".page-inner", 1.25, 900, pad=20)
    d.wait(1.5)
    d.unzoom(600)
    d.click("#newRun")
    page.wait_for_selector("#runName")
    d.wait_voice()
    d.say("s11e")
    d.click("#runName", 500)
    d.type("Release 1")
    for name in ["BRD - Online Permit Renewal", "PID - Online Permit Renewal"]:
        d.click(f'.file-picker label:has-text("{name}") input', 600)
        d.wait(0.3)
    d.zoom(".modal", 1.25, 900, pad=20)
    d.wait(1.0)
    d.unzoom(600)
    d.click('.modal-foot button:has-text("Create run")')
    page.wait_for_selector(".run-stepper")
    d.wait(0.6)
    d.zoom(".run-stepper", 1.5, 900, pad=40)
    d.wait(0.8)
    d.unzoom(600)
    d.click('[data-run-action="start"]')
    run_id = page.evaluate("location.hash.split('run/')[1]")
    d.wait_for(lambda: api("GET", f"/api/runs/{run_id}")["stages"][0]["status"] in ("review", "rework"), 900)
    d.js("() => document.querySelector('.run-step.selected')?.click()")
    page.wait_for_selector('[data-run-action="approve"]', timeout=30000)
    d.wait_voice()
    d.click("[data-open-chat]")
    page.wait_for_selector(".msg.assistant .msg-actions")
    d.wait(0.6)
    d.zoom("#pinnedStrip", 1.6, 800, pad=30)
    d.wait(1.4)
    d.unzoom(600)
    d.reveal(".msg.assistant:last-child .md table, .msg.assistant:last-child .md h2", "center", 1.0)
    d.zoom(".msg.assistant:last-child .md", 1.25, 1000)
    scroll_msgs(d, 420)
    d.wait(2.4)
    d.unzoom(700)
    d.click('.nav-item[data-nav="runs"]')
    d.wait(0.6)
    d.click("[data-run]")
    page.wait_for_selector('[data-run-action="check"]')
    d.wait(0.5)
    d.say("s11f")
    d.click('[data-run-action="check"]')
    d.wait_for(lambda: not api("GET", f"/api/runs/{run_id}")["stages"][0].get("checkRunning"), 900)
    d.js("() => document.querySelector('.run-step.selected')?.click()")
    page.wait_for_selector(".run-findings", timeout=30000)
    d.wait(0.6)
    d.reveal(".run-findings", "start", 1.0)
    d.zoom(".run-findings", 1.25, 1000, pad=30)
    d.wait_voice()
    d.wait(1.0)
    d.unzoom(700)
    d.js("() => document.querySelector('.run-actions')?.scrollIntoView({ behavior: 'smooth', block: 'center' })")
    d.wait(0.8)
    d.say("s11g")
    d.click('[data-run-action="approve"]')
    page.wait_for_selector('.page-inner p:has-text("Approved by")', timeout=30000)
    d.wait(0.6)
    d.zoom(".page-inner", 1.2, 900, pad=10)
    d.wait(2.0)
    d.unzoom(600)
    if d.exists("[data-run-ado]"):
        d.zoom(".run-actions", 1.7, 900, pad=40)
        d.hover("[data-run-ado]", 600)
        d.wait_voice()
        d.unzoom(600)
    d.wait_voice()
    d.say("s11h")
    d.click("[data-run-word]")
    page.wait_for_selector('.modal:has-text("Saved as Word")', timeout=60000)
    d.wait(0.6)
    d.zoom(".modal", 1.5, 900, pad=20)
    d.wait_voice()
    d.unzoom(600)
    d.click('.modal-foot button:has-text("Close")')
    d.wait(0.5)

    # ---------------- 12. Specialist samples
    d.third(None)
    d.card(f'<div class="stepnum rise">12</div><div class="kicker rise" style="animation-delay:.12s">How to</div>'
           f'<h1 class="rise" style="animation-delay:.22s"><em>Try the specialist samples</em></h1>', persist=True)
    d.say("t12")
    api("PUT", "/api/settings", {"workspace": str(WORKSPACE), "access": "read", "demoInstalled": "", "demoPack": ""})
    page.goto(f"http://localhost:{PORT}/#samples")
    page.reload()  # only the hash changed, so goto alone keeps the old settings in the page
    page.wait_for_selector('[data-install-demo="data"]')
    d.wait_voice(0.2)
    d.uncard(700)
    d.third(f'<div class="num">12</div><div><b>Try the specialist samples</b><span>Step 12 of {TOTAL}</span></div>')
    d.zoom(".card-grid", 1.2, 900, pad=20)
    d.say("s12a")
    for pack in ["data", "security", "change"]:
        d.hover(f'.sample-card:has([data-install-demo="{pack}"])', 550)
        d.wait(0.6)
    d.wait_voice()
    d.unzoom(600)
    d.say("s12b")
    d.click('[data-install-demo="data"]', 600)
    page.wait_for_selector(".demo-banner.active", timeout=30000)
    d.wait(1.0)
    d.zoom(".demo-banner", 1.45, 900, pad=30)
    d.wait_voice()
    d.unzoom(600)
    d.click('.demo-actions [data-recipe="data-profile"]')
    d.wait(1.2)
    page.select_option('.modal [data-file-select="extract"]', label="Applications - source extract.csv")
    page.select_option('.modal [data-file-select="dictionary"]', label="Data Dictionary - Applications.xlsx")
    d.zoom(".modal", 1.35, 900, pad=20)
    d.say("s12c")
    d.hover('.modal [data-file-select="extract"]', 500)
    d.wait(0.5)
    d.hover('.modal [data-file-select="dictionary"]', 500)
    d.wait_voice()
    d.unzoom(600)
    before = d.replies()
    d.click(".modal-foot .btn.grad")
    d.wait(1.6)
    if d.exists(".msg.assistant:last-child .steps"):
        d.js("() => document.querySelector('.msg.assistant:last-child .steps-head')?.click()")
        d.zoom(".msg.assistant:last-child", 1.4, 800, pad=40)
    d.wait_reply(before)
    d.unzoom(600)
    d.reveal(".msg.assistant:last-child .md table", "center", 1.0)
    d.zoom(".msg.assistant:last-child .md table", 1.3, 1000, pad=40)
    d.say("s12d")
    scroll_msgs(d, 380)
    d.wait_voice()
    d.unzoom(700)
    if d.exists(".msg.assistant:last-child .file-cards"):
        d.reveal(".msg.assistant:last-child .file-cards", "center", 1.0)
        d.zoom(".msg.assistant:last-child .file-cards", 1.8, 900, pad=40)
    d.say("s12e")
    d.wait_voice()
    d.unzoom(700)

    # ---------------- 13. Insights
    step(d, 13, "See what's working", "t13")
    d.click('.nav-item[data-nav="insights"]')
    page.wait_for_selector("#insightsBody table, #insightsBody .insights-empty", timeout=30000)
    d.wait(0.6)
    d.zoom("#insightsBody", 1.3, 1000, pad=20)
    d.say("s13")
    d.wait_voice()
    d.unzoom(600)

    # ---------------- 13. Microsoft 365 Copilot
    step(d, 14, "Take it to Microsoft 365 Copilot", "t14")
    d.click('.nav-item[data-nav="assistants"]')
    d.wait(0.6)
    d.zoom(".page-head", 1.6, 900, pad=30)
    d.wait(0.8)
    d.unzoom(600)
    d.click('[data-assistant-menu="requirements-coach"]')
    d.wait(0.5)
    d.say("s14a")
    d.click('.menu-item:has-text("Export to Microsoft 365 Copilot")')
    page.wait_for_selector(".modal .option-cards", timeout=30000)
    d.wait(0.8)
    d.zoom(".modal", 1.3, 900, pad=20)
    d.wait_voice()
    d.unzoom(600)
    d.click('.modal-foot button:has-text("Done")')
    d.click('.nav-item[data-nav="recipes"]')
    d.wait(0.6)
    d.say("s14b")
    d.click("[data-export-prompts]")
    page.wait_for_selector('.modal-foot button:has-text("Done")', timeout=30000)
    d.wait(0.6)
    d.zoom(".modal", 1.5, 900, pad=20)
    d.wait_voice()
    d.unzoom(600)
    d.click('.modal-foot button:has-text("Done")')
    d.click('.nav-item[data-nav="assistants"]')
    d.wait(0.6)
    d.say("s14c")
    d.click('[data-assistant-menu="traceability-analyst"]')
    d.wait(0.5)
    d.click('.menu-item:has-text("Use in VS Code")')
    page.wait_for_selector('.modal-foot button:has-text("Done")', timeout=30000)
    d.wait(0.8)
    d.zoom(".modal", 1.35, 900, pad=30)
    d.wait_voice()
    d.unzoom(600)
    d.click('.modal-foot button:has-text("Done")')
    d.wait(0.4)
    d.zoom(".page-head", 1.6, 900, pad=30)
    d.say("s14d")
    d.hover("[data-export-engineering]", 700)
    d.wait_voice()
    d.unzoom(600)

    # ---------------- 15. Make it yours
    step(d, 15, "Make it yours", "t15")
    d.third(None)
    d.click("#settingsBtn")
    d.wait(0.8)
    d.zoom("#providerCards", 1.6, 1000, pad=40)
    d.say("s15a")
    d.hover('#providerCards [data-provider="copilot-cli"]', 600)
    d.wait(0.6)
    d.hover('#providerCards [data-provider="claude-cli"]', 600)
    d.wait_voice()
    d.unzoom(600)
    d.say("s15b")
    d.js("() => document.querySelector('#sTheme')?.scrollIntoView({ behavior: 'smooth', block: 'center' })")
    d.wait(1.0)
    d.click('#sTheme [data-v="dark"]', 600)
    d.wait(1.2)
    d.wait_voice()
    if d.exists('.modal-foot button[data-a]'):
        d.click('.modal-foot button:has-text("Close")')
    d.wait(0.8)
    d.say("s15c")
    d.key("Control+/")
    page.wait_for_selector(".kbd-list", timeout=10000)
    d.wait(0.5)
    d.zoom(".modal", 1.4, 900, pad=20)
    d.wait_voice()
    d.wait(0.6)
    d.unzoom(600)
    d.click('.modal-foot button:has-text("Done")')
    d.wait(0.5)

    # ---------------- End card
    page.evaluate("Film.hideCursor(true)")
    d.card(f'<div class="logo rise">{LOGO}</div><h1 class="rise" style="animation-delay:.2s"><em>Lumen</em></h1>'
           f'<p class="rise" style="animation-delay:.4s">Built for GitHub Copilot. Ready for Microsoft 365 Copilot.</p>'
           f'<div class="pills rise" style="animation-delay:.7s"><span>🐙 GitHub Copilot CLI</span><span>🟣 Claude Code</span><span>🤝 Agents</span><span>⚡ Prompt gallery</span>'
           f'<span>📓 Notebook</span><span>📅 Project &amp; Excel</span><span>🔷 Azure DevOps</span><span>🧬 Guided lifecycle</span><span>🧪 Specialist samples</span><span>🎞️ PowerPoint decks</span><span>🪟 Exports to Microsoft 365 Copilot</span></div>')
    d.say("end")
    d.wait_voice(1.8)


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--record", action="store_true")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--voice", action="store_true")
    ap.add_argument("--stills", action="store_true")
    ap.add_argument("--keep-frames", action="store_true")
    ap.add_argument("--refinish", action="store_true", help="re-run only the edit (trim, audio, encode) from the last film's kept frames")
    args = ap.parse_args()

    if args.refinish:
        mv.make_voice()
        saved = json.loads((mv.WORK / "events.json").read_text(encoding="utf-8"))
        args.keep_frames = True
        mv.finish(type("Cap", (), {"frames": [tuple(f) for f in saved["frame_list"]]})(), saved["events"], args)
        return

    lengths = mv.make_voice() if not args.record else {k: 0 for k in LINES}
    if args.voice:
        total = 0
        for k, v in lengths.items():
            total += v
            print(f"{k:6} {v:5.1f}s")
        print(f"total narration {total:.0f}s")
        return

    from playwright.sync_api import sync_playwright
    mode = "record" if args.record else "film"
    server = start_server(mode, args.resume)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="msedge", headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--force-color-profile=srgb"])
            page = browser.new_page(viewport={"width": mv.VIEW[0], "height": mv.VIEW[1]}, device_scale_factor=mv.DSF)
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.add_init_script(mv.INIT)
            page.add_init_script(path=str(FILM / "overlay.js"))
            page.goto(f"http://localhost:{PORT}/")
            page.evaluate("sessionStorage.filmHour = '14'")
            page.goto(f"http://localhost:{PORT}/")
            page.wait_for_selector("#obName")
            page.wait_for_timeout(1200)
            d = mv.Director(page, mode == "film", lengths)
            cap = None
            if mode == "film":
                cap = mv.Capture(page)
                cap.start()
            started = time.time()
            try:
                run_howto(d)
            except Exception:
                page.screenshot(path=str(mv.WORK / "failure.png"))
                raise
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
    mv.finish(cap, d.events, args)


if __name__ == "__main__":
    main()
