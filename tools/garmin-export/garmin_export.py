#!/usr/bin/env python3
"""
FAIN Coach — Garmin Connect export helper.

Downloads your runs from Garmin Connect as TCX files, which you then import
into FAIN Coach by dropping them on the Upload screen.

Your Garmin password is read with getpass(), never taken as a command-line
argument and never written to disk. It is used once, to mint OAuth tokens;
those are cached (outside this repo) so later runs need no password at all.

    python garmin_export.py --days 90
    python garmin_export.py --from 2026-01-01 --to 2026-06-30
    python garmin_export.py --days 30 --out ./my-runs

Requires:  pip install garminconnect curl_cffi

This uses Garmin's PRIVATE web API through an unofficial client. See the
disclosure printed on first run, and README.md.
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date, timedelta
from getpass import getpass
from pathlib import Path

try:
    from garminconnect import Garmin
except ImportError:  # pragma: no cover - guidance, not logic
    sys.exit("Missing dependency. Run:  pip install garminconnect curl_cffi")

# Deliberately outside the repository — a token file is a live credential and
# must never end up in a commit.
TOKENSTORE = Path.home() / ".fain-coach" / "garmin-tokens"

DISCLOSURE = """\
------------------------------------------------------------------
 Garmin Connect has no official personal API. This tool uses their
 private web API through an unofficial client, which means:

   * it needs your Garmin email and password (used once, locally,
     to obtain access tokens - never sent anywhere else),
   * it may stop working without notice if Garmin changes things,
   * it may conflict with Garmin's terms of service.

 Nothing here is sent to FAIN Coach or any other server. The files
 are written to a folder on this machine and it is up to you to
 import them.
------------------------------------------------------------------
"""

# Garmin rate-limits logins per IP; this was hit for real during the Sprint 15
# spike, where two of five login strategies returned 429 before one succeeded.
# Downloads are gentler, but a long backfill still deserves a pause.
DOWNLOAD_PAUSE_SECONDS = 1.0
MAX_RETRIES = 4


def connect() -> Garmin:
    """Resume from cached tokens when possible, otherwise log in once."""
    if TOKENSTORE.exists() and any(TOKENSTORE.iterdir()):
        try:
            client = Garmin()
            client.login(str(TOKENSTORE))
            print(f"Signed in from cached tokens ({TOKENSTORE}).")
            return client
        except Exception as e:  # noqa: BLE001 - expired/rotated tokens are normal
            print(f"Cached tokens unusable ({e}); signing in again.")

    print(DISCLOSURE)
    email = input("Garmin email: ").strip()
    password = getpass("Garmin password (not echoed, never stored): ")

    client = Garmin(
        email,
        password,
        prompt_mfa=lambda: input("MFA code: ").strip(),
    )
    client.login(str(TOKENSTORE))
    TOKENSTORE.parent.mkdir(parents=True, exist_ok=True)
    print(f"Signed in. Tokens cached in {TOKENSTORE} — no password needed next time.")
    return client


def with_retries(fn, what: str):
    """Retry through Garmin's rate limiting. A 429 is expected, not an error."""
    delay = 2.0
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 - the client wraps many error types
            transient = "429" in str(e) or "rate" in str(e).lower()
            if not transient or attempt == MAX_RETRIES:
                raise
            print(f"  rate limited on {what}; waiting {delay:.0f}s "
                  f"(attempt {attempt}/{MAX_RETRIES})")
            time.sleep(delay)
            delay *= 2
    return None


def link_to_worker(worker_url: str) -> int:
    """
    Sign in locally, then hand ONLY the resulting tokens to the Worker.

    The password never leaves this machine — it is used here to mint tokens,
    and the tokens are what travel. The Worker returns a link code, which is
    what you paste into FAIN Coach; from then on the app imports on its own.
    """
    import json

    import requests
    from garminconnect.client import token_file_path

    connect()  # mints and caches tokens (prompting only if needed)

    token_file = token_file_path(str(TOKENSTORE))
    try:
        tokens = json.loads(token_file.read_text(encoding="utf-8"))
    except OSError as e:
        print(f"Could not read tokens from {token_file}: {e}")
        return 1

    missing = [k for k in ("di_token", "di_refresh_token", "di_client_id") if not tokens.get(k)]
    if missing:
        print(f"Token file is missing {', '.join(missing)}. Delete {TOKENSTORE} and try again.")
        return 1

    endpoint = f"{worker_url}/api/garmin/link"
    print(f"\nSending tokens to {endpoint} …")
    try:
        r = requests.post(
            endpoint,
            json={"tokens": tokens, "label": "garmin-export helper"},
            timeout=30,
        )
    except Exception as e:  # noqa: BLE001
        print(f"Could not reach the Worker: {e}")
        return 1

    if not r.ok:
        print(f"Worker refused the link ({r.status_code}): {r.text[:300]}")
        return 1

    code = r.json().get("linkCode")
    if not code:
        print(f"Worker replied without a link code: {r.text[:300]}")
        return 1

    print("\n" + "=" * 60)
    print(" Linked. Paste this code into FAIN Coach → Settings → Garmin:\n")
    print(f"   {code}\n")
    print(" Treat it like a password: anyone holding it can read your Garmin")
    print(" activities through this Worker. You can revoke it any time from")
    print(" Settings, which also stops the Worker using your tokens.")
    print("=" * 60)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Export Garmin runs as TCX for FAIN Coach.")
    ap.add_argument("--days", type=int, help="How many days back to export.")
    ap.add_argument("--from", dest="start", help="Start date, YYYY-MM-DD.")
    ap.add_argument("--to", dest="end", help="End date, YYYY-MM-DD (default: today).")
    ap.add_argument("--out", default="garmin-runs", help="Output folder.")
    ap.add_argument("--all-activities", action="store_true",
                    help="Include non-running activities too.")
    ap.add_argument("--link", metavar="URL",
                    help="Instead of downloading, hand the tokens to your FAIN "
                         "Coach Worker so the app can import on its own "
                         "(e.g. --link https://coach.fainsilber.co.il).")
    args = ap.parse_args()

    if args.link:
        return link_to_worker(args.link.rstrip("/"))

    if args.days:
        end = date.today()
        start = end - timedelta(days=args.days)
    elif args.start:
        start = date.fromisoformat(args.start)
        end = date.fromisoformat(args.end) if args.end else date.today()
    else:
        ap.error("Pass either --days N or --from YYYY-MM-DD")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    client = connect()
    print(f"\nLooking for activities from {start} to {end}…")
    activities = with_retries(
        lambda: client.get_activities_by_date(start.isoformat(), end.isoformat()),
        "the activity list",
    ) or []

    if not args.all_activities:
        activities = [
            a for a in activities
            if "running" in (a.get("activityType") or {}).get("typeKey", "")
        ]

    if not activities:
        print("No matching activities in that range.")
        return 0

    print(f"Found {len(activities)} activities.\n")
    written = skipped = failed = 0

    for a in activities:
        aid = a.get("activityId")
        # The filename is what makes re-import idempotent: FAIN Coach reads the
        # activity id back out of it to recognise runs it already has.
        dest = out / f"garmin-{aid}.tcx"
        label = f"{str(a.get('startTimeLocal'))[:10]}  {(a.get('distance') or 0) / 1000:.2f} km"

        if dest.exists():
            print(f"  skip   {label}  (already downloaded)")
            skipped += 1
            continue

        try:
            data = with_retries(
                lambda aid=aid: client.download_activity(
                    aid, dl_fmt=Garmin.ActivityDownloadFormat.TCX
                ),
                f"activity {aid}",
            )
            dest.write_bytes(data)
            print(f"  ok     {label}  -> {dest.name}  ({len(data):,} bytes)")
            written += 1
            time.sleep(DOWNLOAD_PAUSE_SECONDS)
        except Exception as e:  # noqa: BLE001 - one bad activity must not stop the run
            print(f"  FAILED {label}  ({e})")
            failed += 1

    print(f"\nDone. {written} downloaded, {skipped} already present, {failed} failed.")
    print(f"Files are in: {out.resolve()}")
    print("Drop them onto the Upload screen in FAIN Coach to import.")
    return 1 if failed and not written else 0


if __name__ == "__main__":
    raise SystemExit(main())
