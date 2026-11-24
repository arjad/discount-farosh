"""user role (client / restaurant) and restaurant name

Revision ID: b7c1d2e3f4a5
Revises: 37de038181c3
Create Date: 2026-11-22 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7c1d2e3f4a5'
down_revision: Union[str, Sequence[str], None] = '37de038181c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('role', sa.String(length=20), server_default='client', nullable=False))
    op.add_column('users', sa.Column('restaurant_name', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'restaurant_name')
    op.drop_column('users', 'role')
