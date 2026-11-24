"""Offer views + restaurant pictures for customers.

  POST /api/public/offers/views                      {offer_ids, source: "link"|"sidebar", viewer}
       One view per offer each time a customer opens it from a shared link or in the dashboard sidebar.
       The same viewer opening the same offer again within 30 minutes isn't counted twice, and
       restaurant accounts' own looks aren't counted.
  PUT/DELETE /api/public/offers/{id}/favourite        {viewer}  a customer saved / unsaved an offer (♥)
  GET  /api/public/restaurant-media/{user_id}/{logo|cover}   a restaurant account's logo / cover photo
"""
import base64
import re
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Offer, OfferFavourite, OfferView, User, UserSession
from app.db.session import get_session
from app.public.auth import _hash_token

router = APIRouter(prefix="/api/public", tags=["views"])

DEDUPE = timedelta(minutes=30)
VIEWER_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


async def _optional_user(session: AsyncSession, token: str | None) -> User | None:
    if not token:
        return None
    row = await session.scalar(select(UserSession).where(UserSession.token_hash == _hash_token(token)))
    if not row or row.expires_at <= datetime.now(timezone.utc):
        return None
    return await session.get(User, row.user_id)


class ViewsIn(BaseModel):
    offer_ids: list[int] = Field(min_length=1, max_length=30)
    source: Literal["link", "sidebar"]
    viewer: str | None = Field(default=None, max_length=64)  # random id the browser keeps


@router.post("/offers/views", status_code=204)
async def record_views(body: ViewsIn, request: Request, session: AsyncSession = Depends(get_session),
                       df_session: str | None = Cookie(default=None)) -> None:
    user = await _optional_user(session, df_session)
    if user and user.role == "restaurant":
        return  # restaurants checking their own (or others') deals aren't customer views
    viewer = _viewer(user, body.viewer, request)
    ids = list(dict.fromkeys(body.offer_ids))
    real = set(await session.scalars(select(Offer.id).where(Offer.id.in_(ids))))
    since = datetime.now(timezone.utc) - DEDUPE
    recent = set(await session.scalars(select(OfferView.offer_id).where(
        OfferView.offer_id.in_(real), OfferView.viewer == viewer, OfferView.created_at > since)))
    for oid in ids:
        if oid in real and oid not in recent:
            session.add(OfferView(offer_id=oid, user_id=user.id if user else None, viewer=viewer, source=body.source))
    await session.commit()


def _viewer(user: User | None, given: str | None, request: Request) -> str:
    if user:
        return f"u:{user.id}"
    if given and VIEWER_RE.match(given):
        return f"a:{given}"
    return f"ip:{request.client.host if request.client else '?'}"


class FavIn(BaseModel):
    viewer: str | None = Field(default=None, max_length=64)


async def _set_fav(offer_id: int, on: bool, body: FavIn, request: Request, session: AsyncSession, token: str | None) -> None:
    user = await _optional_user(session, token)
    if user and user.role == "restaurant":
        return
    viewer = _viewer(user, body.viewer, request)
    row = await session.get(OfferFavourite, (offer_id, viewer))
    if on and not row and await session.get(Offer, offer_id):
        session.add(OfferFavourite(offer_id=offer_id, viewer=viewer, user_id=user.id if user else None))
    elif not on and row:
        await session.delete(row)
    await session.commit()


@router.put("/offers/{offer_id}/favourite", status_code=204)
async def add_favourite(offer_id: int, body: FavIn, request: Request, session: AsyncSession = Depends(get_session),
                        df_session: str | None = Cookie(default=None)) -> None:
    await _set_fav(offer_id, True, body, request, session, df_session)


@router.delete("/offers/{offer_id}/favourite", status_code=204)
async def remove_favourite(offer_id: int, body: FavIn, request: Request, session: AsyncSession = Depends(get_session),
                           df_session: str | None = Cookie(default=None)) -> None:
    await _set_fav(offer_id, False, body, request, session, df_session)


@router.get("/restaurant-media/{user_id}/{kind}")
async def restaurant_media(user_id: int, kind: Literal["logo", "cover"], session: AsyncSession = Depends(get_session)):
    u = await session.get(User, user_id)
    data = (u.avatar if kind == "logo" else u.cover) if u and u.role == "restaurant" else None
    m = re.match(r"^data:(image/[a-z+.-]+);base64,(.+)$", data or "", re.S)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No picture.")
    # the URL carries ?v=<hash of the picture>, so it can be cached for a long time
    return Response(base64.b64decode(m.group(2)), media_type=m.group(1),
                    headers={"Cache-Control": "public, max-age=2592000, immutable"})
