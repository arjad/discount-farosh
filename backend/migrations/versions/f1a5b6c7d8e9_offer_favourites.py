"""offer favourites (counted per customer, logged in or not)

Revision ID: f1a5b6c7d8e9
Revises: e0f4a5b6c7d8
Create Date: 2026-11-22 16:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1a5b6c7d8e9'
down_revision: Union[str, Sequence[str], None] = 'e0f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'offer_favourites',
        sa.Column('offer_id', sa.BigInteger(), sa.ForeignKey('offers.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('viewer', sa.String(80), primary_key=True),
        sa.Column('user_id', sa.BigInteger(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('offer_favourites')
