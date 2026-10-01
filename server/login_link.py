"""Print a one-time sign-in link (15 minutes) for an allowed email. Runs where the data volume is:

    railway ssh -- python -m server.login_link martinkaiser.bln@googlemail.com
"""
import sys

from server.auth import LINK_TTL, new_link
from server.db import Db
from server.settings import Settings, canonical


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    settings = Settings.from_env()
    email = canonical(sys.argv[1])
    db = Db(settings.data_dir / "zz.db")
    if not (settings.is_allowed(email) or db.is_invited(email)):
        raise SystemExit(f"{email} is not allowed — set OWNER_EMAIL / ALLOWED_EMAILS or invite it")
    print(new_link(db, settings.site_url, email, LINK_TTL))


if __name__ == "__main__":
    main()
