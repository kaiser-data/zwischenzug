"""Print one-time sign-in links. Runs where the data volume is (Railway):

    railway ssh -- python -m server.login_link <email>            # an allowed email, 15 minutes
    railway ssh -- python -m server.login_link --invite <email>   # invite someone new, 7 days

Each call makes a new link; a link works once. The server keeps only a hash, so a lost link
cannot be shown again — make a new one.
"""
import sys

from server.auth import INVITE_TTL, LINK_TTL, new_link
from server.db import Db
from server.settings import Settings, canonical


def main() -> None:
    args = sys.argv[1:]
    invite = "--invite" in args
    emails = [a for a in args if a != "--invite"]
    if len(emails) != 1 or "@" not in emails[0]:
        raise SystemExit(__doc__)
    settings = Settings.from_env()
    email = canonical(emails[0])
    db = Db(settings.data_dir / "zz.db")
    if invite:
        db.add_invite(email, settings.owner or "cli")
    elif not (settings.is_allowed(email) or db.is_invited(email)):
        raise SystemExit(f"{email} is not allowed — use --invite to invite it")
    print(new_link(db, settings.site_url, email, INVITE_TTL if invite else LINK_TTL))


if __name__ == "__main__":
    main()
