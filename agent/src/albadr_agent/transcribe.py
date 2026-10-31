import hashlib
import json
import logging
from pathlib import Path

import httpx
from faster_whisper import WhisperModel
from pydantic import BaseModel

log = logging.getLogger("albadr_agent")
CACHE_ROOT = Path.home() / ".cache" / "albadr-agent"
DEFAULT_AUDIO = CACHE_ROOT / "audio"
DEFAULT_TRANSCRIPTS = CACHE_ROOT / "transcripts"
MODEL = "large-v3-turbo"


class Segment(BaseModel):
    start: float
    end: float
    text: str


def url_key(url: str) -> str:
    return hashlib.sha1(url.encode()).hexdigest()


def download_audio(url: str, audio_dir: Path = DEFAULT_AUDIO, fetch=httpx.get) -> Path:
    audio_dir.mkdir(parents=True, exist_ok=True)
    mp3 = audio_dir / f"{url_key(url)}.mp3"
    if mp3.exists():
        return mp3
    response = fetch(url, follow_redirects=True, timeout=600)
    response.raise_for_status()
    temp = mp3.with_name(mp3.name + ".part")
    temp.write_bytes(response.content)
    temp.replace(mp3)
    return mp3


def transcribe(mp3: Path, out: Path) -> list[Segment]:
    if out.exists():
        try:
            return [Segment(**s) for s in json.loads(out.read_text())]
        except (ValueError, TypeError):
            log.warning("corrupt transcript %s, transcribing again", out)
    model = WhisperModel(MODEL, device="cpu", compute_type="int8", cpu_threads=8)
    raw, _ = model.transcribe(str(mp3), language="ar", vad_filter=True)
    segments = [
        Segment(start=round(s.start, 2), end=round(s.end, 2), text=s.text.strip()) for s in raw
    ]
    out.parent.mkdir(parents=True, exist_ok=True)
    temp = out.with_name(out.name + ".part")
    temp.write_text(json.dumps([s.model_dump() for s in segments], ensure_ascii=False))
    temp.replace(out)
    return segments
