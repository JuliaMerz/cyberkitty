"""add part_label

Revision ID: c780570cc7cb
Revises: 44b5c4bf1a35
Create Date: 2023-11-16 21:00:57.733636

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel



# revision identifiers, used by Alembic.
revision: str = 'c780570cc7cb'
down_revision: Union[str, None] = '44b5c4bf1a35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('chapter_outlines', schema=None) as batch_op:
        batch_op.add_column(sa.Column('part_label', sqlmodel.sql.sqltypes.AutoString(), nullable=True))

    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('chapter_outlines', schema=None) as batch_op:
        batch_op.drop_column('part_label')

    # ### end Alembic commands ###
