def test_blank_profile_shape(browser_page, profile_harness_url):
    page = browser_page
    page.goto(profile_harness_url)
    result = page.evaluate(
        """() => {
            const blank = window.PathProfile.blank();
            return { keys: Object.keys(blank).sort(), blank: blank };
        }"""
    )
    assert result["keys"] == [
        "blitzCap",
        "displayName",
        "federation",
        "fideId",
        "focus",
        "leak",
        "lichess",
        "notes",
        "ratingBlitz",
        "ratingStandard",
        "weekTarget",
    ]
    assert result["blank"] == {
        "displayName": "",
        "fideId": "",
        "federation": "",
        "lichess": "",
        "ratingStandard": None,
        "ratingBlitz": None,
        "focus": "",
        "leak": "",
        "blitzCap": 3,
        "weekTarget": 600,
        "notes": {},
    }


def test_ladder_gap_with_rating(browser_page, profile_harness_url):
    page = browser_page
    page.goto(profile_harness_url)
    result = page.evaluate(
        """() => {
            const p = window.PathProfile.blank();
            p.ratingStandard = 2171;
            return {
                to2200: window.PathProfile.ladderGap(p, 2200),
                to2500: window.PathProfile.ladderGap(p, 2500)
            };
        }"""
    )
    assert result == {"to2200": "+29", "to2500": "+329"}


def test_ladder_gap_without_rating(browser_page, profile_harness_url):
    page = browser_page
    page.goto(profile_harness_url)
    result = page.evaluate(
        """() => {
            const p = window.PathProfile.blank();
            return window.PathProfile.TITLES.map(function (t) {
                return window.PathProfile.ladderGap(p, t.rating);
            });
        }"""
    )
    assert result == ["—", "—", "—", "—"]


def test_ladder_gap_above_threshold(browser_page, profile_harness_url):
    page = browser_page
    page.goto(profile_harness_url)
    result = page.evaluate(
        """() => {
            const p = window.PathProfile.blank();
            p.ratingStandard = 2350;
            return window.PathProfile.ladderGap(p, 2200);
        }"""
    )
    assert result == "reached"


def test_k_factor(browser_page, profile_harness_url):
    page = browser_page
    page.goto(profile_harness_url)
    result = page.evaluate(
        """() => {
            function kFor(rating) {
                const p = window.PathProfile.blank();
                p.ratingStandard = rating;
                return window.PathProfile.kFactor(p);
            }
            return {
                r2171: kFor(2171),
                r2400: kFor(2400),
                r2500: kFor(2500),
                blank: window.PathProfile.kFactor(window.PathProfile.blank())
            };
        }"""
    )
    assert result == {"r2171": 20, "r2400": 10, "r2500": 10, "blank": None}


def test_merge_ignores_wrong_types(browser_page, profile_harness_url):
    page = browser_page
    page.goto(profile_harness_url)
    result = page.evaluate(
        """() => {
            return window.PathProfile.merge({
                blitzCap: "three",
                notes: null,
                displayName: 7
            });
        }"""
    )
    assert result["blitzCap"] == 3
    assert result["notes"] == {}
    assert result["displayName"] == ""


def test_merge_preserves_unknown_keys(browser_page, profile_harness_url):
    page = browser_page
    page.goto(profile_harness_url)
    result = page.evaluate(
        """() => {
            return window.PathProfile.merge({ futureField: 42 });
        }"""
    )
    assert result["futureField"] == 42
