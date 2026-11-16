import json
import subprocess
from pathlib import Path


def test_native_ffmpeg_trim(tmp_path: Path) -> None:
    source = tmp_path / "source.mp4"
    output = tmp_path / "trimmed.mp4"
    subprocess.run(["bash", "tests/fixtures/make-video.sh", str(source)], check=True)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", "0.5", "-i", str(source), "-t", "2", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", str(output)], check=True)
    probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", str(output)], text=True))
    assert output.stat().st_size > 1000
    assert any(stream.get("codec_type") == "video" and stream.get("width") == 320 and stream.get("height") == 180 for stream in probe["streams"])
    assert 1.5 < float(probe["format"]["duration"]) < 3
