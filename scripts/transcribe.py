#!/usr/bin/env python3
"""Local speech-to-text via faster-whisper (tiny.en)."""

from __future__ import annotations

import sys


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: transcribe.py <audio-file>", file=sys.stderr)
        return 2

    audio_path = sys.argv[1]

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "未安装 faster-whisper。请运行: pip3 install -r requirements-whisper.txt",
            file=sys.stderr,
        )
        return 3

    model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
    segments, _info = model.transcribe(
        audio_path,
        language="en",
        vad_filter=True,
        beam_size=1,
    )

    text = "".join(segment.text for segment in segments).strip()
    if not text:
        print("没识别到内容", file=sys.stderr)
        return 4

    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
