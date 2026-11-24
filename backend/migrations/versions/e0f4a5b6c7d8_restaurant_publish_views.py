"""publish restaurant deals as offers; offer views

Revision ID: e0f4a5b6c7d8
Revises: d9e3f4a5b6c7
Create Date: 2026-11-22 16:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e0f4a5b6c7d8'
down_revision: Union[str, Sequence[str], None] = 'd9e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('businesses', sa.Column('restaurant_branch_id', sa.BigInteger(),
                  sa.ForeignKey('restaurant_branches.id', ondelete='CASCADE'), nullable=True))
    op.create_unique_constraint('uq_businesses_restaurant_branch_id', 'businesses', ['restaurant_branch_id'])
    op.add_column('offers', sa.Column('restaurant_deal_id', sa.BigInteger(),
                  sa.ForeignKey('restaurant_deals.id', ondelete='CASCADE'), nullable=True))
    op.create_index('ix_offers_restaurant_deal_id', 'offers', ['restaurant_deal_id'])
    op.create_table(
        'offer_views',
        sa.Column('id', sa.BigInteger(), primary_key=True),
        sa.Column('offer_id', sa.BigInteger(), sa.ForeignKey('offers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.BigInteger(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('viewer', sa.String(80), nullable=False),
        sa.Column('source', sa.String(20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_offer_views_offer_id', 'offer_views', ['offer_id'])
    op.create_index('ix_offer_views_offer_viewer', 'offer_views', ['offer_id', 'viewer', 'created_at'])


def downgrade() -> None:
    op.drop_table('offer_views')
    op.drop_index('ix_offers_restaurant_deal_id', 'offers')
    op.drop_column('offers', 'restaurant_deal_id')
    op.drop_constraint('uq_businesses_restaurant_branch_id', 'businesses')
    op.drop_column('businesses', 'restaurant_branch_id')
