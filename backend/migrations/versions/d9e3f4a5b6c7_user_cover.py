"""restaurant cover photo

Revision ID: d9e3f4a5b6c7
Revises: c8d2e3f4a5b6
Create Date: 2026-11-22 15:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd9e3f4a5b6c7'
down_revision: Union[str, Sequence[str], None] = 'c8d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('cover', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'cover')
