"""Create or change the one admin account (there is no sign-up for admins).

  .venv/bin/python -m app.admin_cli create --email you@example.com          # asks for the password
  .venv/bin/python -m app.admin_cli password                               # change the admin's password
  .venv/bin/python -m app.admin_cli show                                   # who the admin is

Only one admin can exist: `create` refuses if there already is one (use `password`, or `create --replace`
to swap it for a new email). The password is typed in (hidden) and stored as a scrypt hash — never in a file.
"""
import argparse
import asyncio
import getpass
import os
import sys

from sqlalchemy import delete, func, select

from app.db.models import User, UserSession
from app.db.session import SessionLocal
from app.public.auth import hash_password


def ask_password() -> str:
    pw = os.environ.get("ADMIN_PASSWORD")  # for scripts / CI; otherwise typed in
    if pw is None:
        pw = getpass.getpass("Admin password (min 8 characters): ")
        if pw != getpass.getpass("Repeat password: "):
            sys.exit("Passwords don't match.")
    if len(pw) < 8:
        sys.exit("Use at least 8 characters for the admin password.")
    return pw


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create")
    c.add_argument("--email", required=True)
    c.add_argument("--name", default="Admin")
    c.add_argument("--replace", action="store_true", help="remove the existing admin and make this one")
    sub.add_parser("password")
    sub.add_parser("show")
    args = ap.parse_args()

    async with SessionLocal() as s:
        admin = await s.scalar(select(User).where(User.role == "admin"))
        if args.cmd == "show":
            print(f"Admin: {admin.email} (id {admin.id})" if admin else "No admin account yet.")
            return
        if args.cmd == "password":
            if not admin:
                sys.exit("No admin account yet — run `create` first.")
            admin.password_hash = hash_password(ask_password())
            await s.execute(delete(UserSession).where(UserSession.user_id == admin.id))  # log out everywhere
            await s.commit()
            print(f"Password changed for {admin.email}.")
            return
        email = args.email.strip().lower()
        if admin and not args.replace:
            sys.exit(f"There is already an admin ({admin.email}). Use `password` to change its password, or --replace.")
        if await s.scalar(select(User.id).where(func.lower(User.email) == email, User.role != "admin")):
            sys.exit("That email belongs to a customer or restaurant account — use a different email for the admin.")
        pw = ask_password()
        if admin:
            await s.delete(admin)
            await s.flush()
        s.add(User(email=email, full_name=args.name, role="admin", password_hash=hash_password(pw)))
        await s.commit()
        print(f"Admin account ready: {email}. Log in at http://localhost:5174")


if __name__ == "__main__":
    asyncio.run(main())
