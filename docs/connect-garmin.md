# Connect your Garmin account — one-time setup

This is for **you personally**, if you want FAIN Coach to pull your runs in
from Garmin Connect automatically. It's a five-minute job, and you only do it
**once** — after this, everything happens from your phone or any browser, no
computer needed again.

**Your Garmin password is typed only on this computer, and only used here.**
It's never sent to FAIN Coach, never saved anywhere, and never leaves this
machine. What you end up sending is a short code — think of it like a
one-time PIN — and that's the only thing FAIN Coach ever sees.

If more than one person shares this computer and each wants to connect their
**own** Garmin account, see [Sharing this computer](#sharing-this-computer)
below before you start — skipping it means the second person gets silently
signed in as the first.

---

## What you need

- A Windows, macOS, or Linux computer (a laptop is fine — phones/tablets can't
  do this part; see [why](#why-a-real-computer)).
- Your Garmin Connect email and password.
- 5 minutes, and a working internet connection.

## Step 1 — Get the file

You only need **one file** — not the whole project. Download it:

**👉 <https://raw.githubusercontent.com/fainsilber/FAIN-Coach/main/tools/garmin-export/garmin_export.py>**

Right-click → *Save link as…* (or your browser's equivalent), and save it
somewhere you can find again — your Desktop is fine.

## Step 2 — Open a terminal, and check Python

<details open>
<summary><b>Windows</b></summary>

Press **Win**, type `powershell`, press Enter.

Check Python is there:

```powershell
python --version
```

If that prints something like `Python 3.11.x` or higher, skip to Step 3.

If it says **"Python was not found"** and offers to open the Microsoft
Store — **don't use the Store version**, it can behave oddly with this
script. Instead:

1. Go to <https://www.python.org/downloads/>, download the Windows installer.
2. Run it. On the **first screen**, tick **"Add python.exe to PATH"** before
   clicking Install — this is the step people miss.
3. Close and reopen PowerShell, run `python --version` again to confirm.

> Use `python`, not `python3`, on Windows — `python3` is often just a shortcut
> to the Store prompt even once real Python is installed.

</details>

<details>
<summary><b>macOS</b></summary>

Open **Terminal** (Spotlight: <kbd>⌘</kbd><kbd>Space</kbd>, type `terminal`).

Check Python is there:

```bash
python3 --version
```

If that prints `Python 3.11.x` or higher, skip to Step 3.

If it's missing or macOS offers to install Xcode Command Line Tools, either
accept that prompt (it includes Python 3) or install directly from
<https://www.python.org/downloads/macos/> (get the "macOS 64-bit universal2
installer"). Then reopen Terminal and check again.

</details>

<details>
<summary><b>Linux</b></summary>

Open your terminal app. Almost every current distribution ships Python 3
already:

```bash
python3 --version
```

If it's missing, install it with your distro's package manager, e.g.
`sudo apt install python3 python3-pip python3-venv` on Debian/Ubuntu, or
`sudo dnf install python3 python3-pip` on Fedora.

</details>

## Step 3 — Install the two packages this needs

This creates a small, self-contained folder for just this script (a
**virtual environment**) rather than touching anything else on your system —
and it sidesteps a common error some Linux/macOS setups throw otherwise
(`externally-managed-environment`).

Open a terminal **in the folder where you saved the file** (Step 1), then run
the block for your OS:

<details open>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
python -m venv venv
venv\Scripts\activate
pip install garminconnect curl_cffi
```

</details>

<details>
<summary><b>macOS / Linux</b></summary>

```bash
python3 -m venv venv
source venv/bin/activate
pip install garminconnect curl_cffi
```

</details>

Your prompt should now start with `(venv)`. That means it worked.

> Every time you come back to this in a **new** terminal window, re-run just
> the *activate* line (`venv\Scripts\activate` or `source venv/bin/activate`)
> before running the script again — you won't need to `pip install` a second
> time.

## Step 4 — Run it

Same terminal, same folder:

```
python garmin_export.py --link https://coach.fainsilber.co.il
```

*(macOS/Linux: if `python` isn't found here, use `python3` instead — inside
an activated venv either usually works, but `python3` is the safe fallback.)*

You'll see a short disclosure about this using Garmin's unofficial API (true,
and worth reading once), then:

```
Garmin email: <you type your email, then Enter>
Garmin password (not echoed, never stored): <you type your password — nothing appears on screen, that's normal, then Enter>
MFA code: <only if your Garmin account has 2-factor login turned on>
```

A few seconds later:

```
============================================================
 Linked. In FAIN Coach, go to Upload -> Import from Garmin
 and paste this code:

   fc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

 Treat it like a password: anyone holding it can read your Garmin
 activities through this Worker. "Disconnect Garmin" in that same
 panel revokes it, on the Worker, not just on this device.
============================================================
```

**That code is the only thing that matters from here on.** Copy it.

## Step 5 — Paste it into FAIN Coach

On your phone or in a browser:

1. Open FAIN Coach, sign in (or create your own profile/account if you don't
   have one yet — each person's data stays separate).
2. Go to the **Upload** tab.
3. Under **Import from Garmin**, paste the code, tap **Connect**.
4. Pick a date range, tap **Fetch runs**, review, and import.

You're done. Close the terminal, delete `garmin_export.py` and the `venv`
folder if you like — neither is needed again. From now on, importing more
runs is just the **Upload** tab, on any device, any time.

---

## Sharing this computer

If someone else will *also* run this script on this same computer, to connect
**their own** Garmin account, add `--profile <their name>` to Step 4:

```
python garmin_export.py --link https://coach.fainsilber.co.il --profile mia
```

Without it, the **second** person to run the script gets silently signed in
as the **first** person — the script sees a saved session already sitting
there and skips the login prompt entirely, so they'd never even be asked for
their own Garmin email/password. `--profile` keeps everyone's login separate.

## Why a real computer?

The one-time login step relies on code that impersonates a real browser
closely enough to get past Garmin's bot detection — that code is only
published for Windows/macOS/Linux, not for phones. Everything **after**
login, though, is a simple, portable web request, which is exactly why the
rest of this — browsing dates, importing runs — already works from a phone
browser with no computer involved.

## Troubleshooting

| You see | It means |
|---|---|
| `Cached tokens unusable; signing in again` | Normal — your saved session expired, it'll re-prompt for your password. |
| `rate limited on …; waiting Ns` | Garmin is temporarily throttling logins from your connection. The script waits and retries on its own — let it. |
| `externally-managed-environment` | You skipped the venv steps and tried to `pip install` directly. Go back to Step 3. |
| `Missing dependency. Run: pip install …` | Same as above, or your venv isn't activated — check for `(venv)` at the start of your prompt. |
| The app says *"Garmin rejected the stored session"* | Your connection expired — just run Step 4 again for a fresh code. |

If none of that fits, the technical write-up (architecture, what the Worker
does, what a maintainer needs to check) is in
[garmin-worker-setup.md](garmin-worker-setup.md).
