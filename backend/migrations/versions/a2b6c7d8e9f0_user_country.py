"""user country

Revision ID: a2b6c7d8e9f0
Revises: f1a5b6c7d8e9
Create Date: 2026-11-24 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a2b6c7d8e9f0'
down_revision: Union[str, Sequence[str], None] = 'f1a5b6c7d8e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('country', sa.String(80), nullable=True))
    # every city the sign-up form has offered so far is in Pakistan
    op.execute("UPDATE users SET country = 'Pakistan' WHERE city IS NOT NULL AND country IS NULL")


def downgrade() -> None:
    op.drop_column('users', 'country')
