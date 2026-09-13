import pathlib
import pytest
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session")
def _browser():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        yield browser
        browser.close()


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
