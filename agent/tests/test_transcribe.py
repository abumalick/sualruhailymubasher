import json
from types import SimpleNamespace

from albadr_agent import transcribe as t


def test_transcribes_once_then_reads_cache(tmp_path, monkeypatch):
    created = []

    class FakeModel:
        def __init__(self, name, **kwargs):
            created.append((name, kwargs))

        def transcribe(self, path, **kwargs):
            self.kwargs = kwargs
            segments = iter([
                SimpleNamespace(start=0.123, end=4.5678, text=" بسم الله"),
                SimpleNamespace(start=4.5678, end=9.0, text=" الحمد لله "),
            ])
            return segments, SimpleNamespace(language="ar")

    monkeypatch.setattr(t, "WhisperModel", FakeModel)
    mp3, out = tmp_path / "a.mp3", tmp_path / "out" / "a.json"
    mp3.write_bytes(b"x")

    first = t.transcribe(mp3, out)

    assert [(s.start, s.end, s.text) for s in first] == [
        (0.12, 4.57, "بسم الله"),
        (4.57, 9.0, "الحمد لله"),
    ]
    assert json.loads(out.read_text())[0] == {"start": 0.12, "end": 4.57, "text": "بسم الله"}
    assert created == [("large-v3-turbo", {"device": "cpu", "compute_type": "int8", "cpu_threads": 8})]

    created.clear()
    assert t.transcribe(mp3, out) == first
    assert created == []
