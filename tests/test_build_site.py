import importlib.util
import pathlib
import subprocess
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("build_site", ROOT / "scripts" / "build_site.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


@pytest.fixture(scope="module")
def dist():
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build_site.py")], check=True, capture_output=True)
    return ROOT / "dist"


def test_dist_has_the_public_app_and_no_private_files(dist):
    names = {str(p.relative_to(dist)) for p in dist.rglob("*") if p.is_file()}
    assert {"index.html", "hosted.js", "sw.js", "manifest.webmanifest", "_redirects", "sessions/bundle.js"} <= names
    assert not any("private" in n or n.startswith("books") for n in names)
    html = (dist / "index.html").read_text()
    assert "sessions/private/bundle.js" not in html and '<script src="/api/drills/bundle.js">' in html
    assert (dist / "_redirects").read_text().startswith("/api/*  https://")
    assert "__BUILD__" not in (dist / "sw.js").read_text()


@pytest.mark.skipif(not build.PRIVATE.exists(), reason="no private drills on this machine")
def test_guard_refuses_a_leaked_drill_position(dist, tmp_path):
    leaked = sorted(build.private_marks() - {""})
    public = (ROOT / "sessions" / "bundle.js").read_text()
    mark = next(m for m in leaked if m not in public)
    fake = tmp_path / "dist"
    fake.mkdir()
    (fake / "x.js").write_text("const p = '" + mark + "';")
    with pytest.raises(SystemExit):
        build.check(fake)
