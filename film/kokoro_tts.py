"""Kokoro narration for film/make_foundry.js (same engine, voice and speed as make_video.py).

  python film/kokoro_tts.py <jobs.json>      jobs: [{"text": "...", "out": "path.wav"}, ...]

Needs kokoro-onnx and soundfile, and the model files in KOKORO_DIR (default <repo>/.venv/kokoro):
kokoro-v1.0.onnx and voices-v1.0.bin. Writes 16-bit PCM WAV at Kokoro's native rate.
"""
import json
import os
import pathlib
import sys

import soundfile
from kokoro_onnx import Kokoro

ROOT = pathlib.Path(__file__).resolve().parents[1]
KOKORO = pathlib.Path(os.environ.get("KOKORO_DIR", ROOT / ".venv" / "kokoro"))
VOICE = os.environ.get("KOKORO_VOICE", "af_heart")
SPEED = float(os.environ.get("KOKORO_SPEED", "1.0"))


def main():
    jobs = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    engine = Kokoro(str(KOKORO / "kokoro-v1.0.onnx"), str(KOKORO / "voices-v1.0.bin"))
    for job in jobs:
        audio, rate = engine.create(job["text"], voice=VOICE, speed=SPEED, lang="en-us")
        soundfile.write(job["out"], audio, rate, subtype="PCM_16")
        print("voice", pathlib.Path(job["out"]).stem, flush=True)


if __name__ == "__main__":
    main()
