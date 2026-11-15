"""Batch text-to-speech with Kokoro-82M (Apache-2.0, open weights) via kokoro-onnx.

Reads a JSON list [{"text": ..., "out": "file.wav"}, ...] from stdin and writes 24 kHz WAV files.
Usage:
  uv run --python 3.12 --with kokoro-onnx --with soundfile python tools/tts_kokoro.py MODEL_DIR VOICE [SPEED] < jobs.json
MODEL_DIR must contain kokoro-v1.0.onnx and voices-v1.0.bin
(https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0).
"""
import json
import os
import sys

import soundfile as sf
from kokoro_onnx import Kokoro


def main():
    model_dir, voice = sys.argv[1], sys.argv[2]
    speed = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
    kokoro = Kokoro(os.path.join(model_dir, "kokoro-v1.0.onnx"), os.path.join(model_dir, "voices-v1.0.bin"))
    for job in json.load(sys.stdin):
        samples, rate = kokoro.create(job["text"], voice=voice, speed=speed, lang="en-us")
        sf.write(job["out"], samples, rate)
        print(f"{job['out']}  {len(samples) / rate:.2f}s", flush=True)


if __name__ == "__main__":
    main()
