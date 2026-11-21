"""Insert/update every registered bank:  python -m app.db.seed"""
import asyncio

from app.db.repository import upsert_bank
from app.db.session import SessionLocal, engine
from app.public.bank_scrapers import BANKS


async def main() -> None:
    async with SessionLocal() as session:
        for cls in BANKS.values():
            await upsert_bank(session, cls)
        await session.commit()
    await engine.dispose()
    print(f"seeded {len(BANKS)} banks")


if __name__ == "__main__":
    asyncio.run(main())
