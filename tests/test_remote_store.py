"""The hosted store: local first, then /api/progress; two devices that clash end up merged."""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
STORE = (ROOT / "store.js").read_text()
PAGE = "<!doctype html><meta charset=utf-8><script>" + STORE + "</script>"


class FakeServer:
    """Same contract as server/progress.py: a write needs the latest `updated` as its base."""

    def __init__(self):
        self.state, self.updated, self.clock = None, None, 100.0

    def handle(self, route):
        req = route.request
        if req.method == "GET":
            return route.fulfill(status=200, content_type="application/json",
                                 body=json.dumps({"state": self.state, "updated": self.updated}))
        body = json.loads(req.post_data)
        if self.updated is not None and (body["base"] is None or body["base"] < self.updated):
            return route.fulfill(status=409, content_type="application/json",
                                 body=json.dumps({"state": self.state, "updated": self.updated}))
        self.clock += 1
        self.state, self.updated = body["state"], self.clock
        return route.fulfill(status=200, content_type="application/json", body=json.dumps({"updated": self.updated}))


def device(browser, server):
    ctx = browser.new_context()
    page = ctx.new_page()
    page.route("https://zz.test/", lambda r: r.fulfill(status=200, content_type="text/html", body=PAGE))
    page.route("https://zz.test/api/progress", server.handle)
    page.goto("https://zz.test/")
    page.evaluate("window.s = PathStore.remote('k'); s.hydrate()")
    return ctx, page


def write(page, js):
    page.evaluate("(async () => { " + js + "; s.commit(); await s.synced(); })()")


def test_two_devices_merge(_browser):
    server = FakeServer()
    phone_ctx, phone = device(_browser, server)
    mac_ctx, mac = device(_browser, server)            # both hydrated before either wrote
    write(phone, "s.state.progress.JB2bQpWt = {step: 2}; s.state.aagaard.push({id: 'a', result: 'full'})")
    write(mac, "s.state.progress.XbhWoWMi = {step: 4}; s.state.aagaard.push({id: 'b', result: 'miss'})")
    assert set(server.state["progress"]) == {"JB2bQpWt", "XbhWoWMi"}
    assert [e["id"] for e in server.state["aagaard"]] == ["a", "b"]
    # A third device (or a reload) starts from the merged state.
    _, tablet = device(_browser, server)
    tablet.wait_for_function("Object.keys(s.state.progress).length === 2")
    phone_ctx.close()
    mac_ctx.close()


def test_offline_still_saves_locally(_browser):
    ctx = _browser.new_context()
    page = ctx.new_page()
    page.route("https://zz.test/", lambda r: r.fulfill(status=200, content_type="text/html", body=PAGE))
    page.route("https://zz.test/api/progress", lambda r: r.abort())
    page.goto("https://zz.test/")
    page.evaluate("(async () => { window.s = PathStore.remote('k'); await s.hydrate();"
                  " s.state.progress.x = {step: 1}; s.commit(); await s.synced(); })()")
    assert json.loads(page.evaluate("localStorage.getItem('k')"))["progress"] == {"x": {"step": 1}}
    ctx.close()


def test_merge_rules(_browser):
    page = _browser.new_page()
    page.set_content(PAGE)
    out = page.evaluate("PathStore.merge({a: [1, 2], o: {x: 1, y: {z: 1}}, v: 1}, {a: [2, 3], o: {y: {w: 2}}, v: 2})")
    assert out == {"a": [1, 2, 3], "o": {"x": 1, "y": {"z": 1, "w": 2}}, "v": 2}
    page.close()
