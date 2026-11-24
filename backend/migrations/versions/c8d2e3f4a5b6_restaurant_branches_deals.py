"""restaurant branches and restaurant deals

Revision ID: c8d2e3f4a5b6
Revises: b7c1d2e3f4a5
Create Date: 2026-11-22 13:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'c8d2e3f4a5b6'
down_revision: Union[str, Sequence[str], None] = 'b7c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ts = [
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
]


def upgrade() -> None:
    op.create_table(
        'restaurant_branches',
        sa.Column('id', sa.BigInteger(), primary_key=True),
        sa.Column('owner_id', sa.BigInteger(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(150), nullable=False),
        sa.Column('address', sa.String(400), nullable=False),
        sa.Column('lat', sa.Numeric(9, 6), nullable=False),
        sa.Column('lng', sa.Numeric(9, 6), nullable=False),
        sa.Column('phone', sa.String(30)),
        *[c.copy() for c in _ts],
    )
    op.create_index('ix_restaurant_branches_owner_id', 'restaurant_branches', ['owner_id'])
    op.create_table(
        'restaurant_deals',
        sa.Column('id', sa.BigInteger(), primary_key=True),
        sa.Column('owner_id', sa.BigInteger(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('code', sa.String(20), nullable=False, unique=True),
        sa.Column('title', sa.String(150)),
        sa.Column('discount_percent', sa.Numeric(5, 2), nullable=False),
        sa.Column('max_discount', sa.Integer()),
        sa.Column('cards', postgresql.JSONB(), server_default='[]', nullable=False),
        sa.Column('days', postgresql.ARRAY(sa.Integer()), server_default='{}', nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date()),
        sa.Column('start_time', sa.Time()),
        sa.Column('end_time', sa.Time()),
        sa.Column('is_family', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('family_size', sa.Integer()),
        sa.Column('branch_ids', postgresql.ARRAY(sa.BigInteger()), server_default='{}', nullable=False),
        sa.Column('terms', sa.Text()),
        sa.Column('expired_at', sa.DateTime(timezone=True)),
        *[c.copy() for c in _ts],
        sa.CheckConstraint('discount_percent > 0 AND discount_percent <= 100', name='ck_restaurant_deals_percent'),
    )
    op.create_index('ix_restaurant_deals_owner_id', 'restaurant_deals', ['owner_id'])


def downgrade() -> None:
    op.drop_table('restaurant_deals')
    op.drop_table('restaurant_branches')
