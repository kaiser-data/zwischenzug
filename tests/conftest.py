import sys
import pathlib
import pytest
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))
pytest_plugins = ["server_fixtures"]


@pytest.fixture(scope="session")
def _playwright():
    with sync_playwright() as p:
        yield p


@pytest.fixture(scope="session")
def _browser(_playwright):
    browser = _playwright.chromium.launch(channel="chrome")
    yield browser
    browser.close()


@pytest.fixture
def fake_mic_browser(_playwright):
    """A Chrome whose microphone plays a given WAV file on a loop: fake_mic_browser(path)."""
    opened = []

    def launch(wav):
        browser = _playwright.chromium.launch(channel="chrome", args=[
            "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
            "--use-file-for-fake-audio-capture=" + str(wav)])
        opened.append(browser)
        return browser
    yield launch
    for b in opened:
        b.close()


@pytest.fixture
def browser_page(_browser):
    """A fresh page per test, with console errors collected on page.errors."""
    page = _browser.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    yield page
    page.close()


@pytest.fixture
def app_url():
    def build(session=None, tab=None):
        url = "file://" + str(ROOT / "index.html")
        if session:
            url += "?session=" + session
        if tab:
            url += "#" + tab
        return url
    return build


@pytest.fixture
def harness_url():
    return "file://" + str(ROOT / "tests" / "store_harness.html")


@pytest.fixture
def profile_harness_url():
    return "file://" + str(ROOT / "tests" / "profile_harness.html")
