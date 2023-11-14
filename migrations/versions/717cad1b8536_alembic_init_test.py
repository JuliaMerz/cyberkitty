"""alembic init test

Revision ID: 717cad1b8536
Revises: 
Create Date: 2023-11-13 19:32:10.200522

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel



# revision identifiers, used by Alembic.
revision: str = '717cad1b8536'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('users',
    sa.Column('is_public', sa.Boolean(), nullable=False),
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
    sa.Column('email', sqlmodel.sql.sqltypes.AutoString(length=120), nullable=False),
    sa.Column('hashed_password', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('superuser', sa.Boolean(), nullable=False),
    sa.Column('tokens', sa.Float(), nullable=False),
    sa.Column('created_on', sa.DateTime(), nullable=False),
    sa.Column('updated_on', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email'),
    sa.UniqueConstraint('name')
    )
    op.create_table('queries',
    sa.Column('is_public', sa.Boolean(), nullable=False),
    sa.Column('author_id', sa.Integer(), nullable=False),
    sa.Column('continues', sa.Integer(), nullable=False),
    sa.Column('retries', sa.Integer(), nullable=False),
    sa.Column('original_prompt', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('complete_output', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('created_on', sa.DateTime(), nullable=False),
    sa.Column('updated_on', sa.DateTime(), nullable=False),
    sa.Column('id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('stories',
    sa.Column('is_public', sa.Boolean(), nullable=False),
    sa.Column('title', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
    sa.Column('author_id', sa.Integer(), nullable=False),
    sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('style', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('themes', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('request', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('setting', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('main_characters', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('summary', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('modified', sa.Boolean(), nullable=False),
    sa.Column('created_on', sa.DateTime(), nullable=False),
    sa.Column('updated_on', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('api_calls',
    sa.Column('is_public', sa.Boolean(), nullable=False),
    sa.Column('query_id', sa.Integer(), nullable=False),
    sa.Column('timestamp', sa.DateTime(), nullable=False),
    sa.Column('success', sa.Boolean(), nullable=False),
    sa.Column('error', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('cost', sa.Float(), nullable=True),
    sa.Column('output', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('created_on', sa.DateTime(), nullable=False),
    sa.Column('updated_on', sa.DateTime(), nullable=False),
    sa.Column('id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['query_id'], ['queries.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('story_outlines',
    sa.Column('is_public', sa.Boolean(), nullable=False),
    sa.Column('author_id', sa.Integer(), nullable=False),
    sa.Column('story_id', sa.Integer(), nullable=False),
    sa.Column('outline_onesentence', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('outline_mainevents_raw', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('editing_notes', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('outline_mainevents_improved', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('outline_paragraphs', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('fact_sheets', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('characters', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('modified', sa.Boolean(), nullable=False),
    sa.Column('invalidated', sa.Boolean(), nullable=False),
    sa.Column('created_on', sa.DateTime(), nullable=False),
    sa.Column('updated_on', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['story_id'], ['stories.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('chapter_outlines',
    sa.Column('is_public', sa.Boolean(), nullable=False),
    sa.Column('author_id', sa.Integer(), nullable=False),
    sa.Column('story_outline_id', sa.Integer(), nullable=False),
    sa.Column('previous_chapter_id', sa.Integer(), nullable=True),
    sa.Column('chapter_number', sa.Integer(), nullable=False),
    sa.Column('title', sqlmodel.sql.sqltypes.AutoString(length=150), nullable=False),
    sa.Column('purpose', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('main_events', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('paragraph_summary', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('chapter_notes', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('raw', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('edit_notes', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('improved', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('modified', sa.Boolean(), nullable=False),
    sa.Column('invalidated', sa.Boolean(), nullable=False),
    sa.Column('created_on', sa.DateTime(), nullable=False),
    sa.Column('updated_on', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['previous_chapter_id'], ['chapter_outlines.id'], ),
    sa.ForeignKeyConstraint(['story_outline_id'], ['story_outlines.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('previous_chapter_id')
    )
    op.create_table('scene_outlines',
    sa.Column('is_public', sa.Boolean(), nullable=False),
    sa.Column('author_id', sa.Integer(), nullable=False),
    sa.Column('chapter_outline_id', sa.Integer(), nullable=False),
    sa.Column('previous_scene_id', sa.Integer(), nullable=True),
    sa.Column('scene_number', sa.Integer(), nullable=False),
    sa.Column('setting', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('primary_function', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('secondary_function', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('summary', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('context', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('raw', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('edit_notes', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('improved', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('modified', sa.Boolean(), nullable=False),
    sa.Column('invalidated', sa.Boolean(), nullable=False),
    sa.Column('created_on', sa.DateTime(), nullable=False),
    sa.Column('updated_on', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['chapter_outline_id'], ['chapter_outlines.id'], ),
    sa.ForeignKeyConstraint(['previous_scene_id'], ['scene_outlines.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('scenes',
    sa.Column('is_public', sa.Boolean(), nullable=False),
    sa.Column('author_id', sa.Integer(), nullable=True),
    sa.Column('scene_outline_id', sa.Integer(), nullable=False),
    sa.Column('previous_scene_id', sa.Integer(), nullable=True),
    sa.Column('scene_number', sa.Integer(), nullable=False),
    sa.Column('raw', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('edit_notes', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('improved', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('modified', sa.Boolean(), nullable=False),
    sa.Column('invalidated', sa.Boolean(), nullable=False),
    sa.Column('created_on', sa.DateTime(), nullable=False),
    sa.Column('updated_on', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['previous_scene_id'], ['scenes.id'], ),
    sa.ForeignKeyConstraint(['scene_outline_id'], ['scene_outlines.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('scenes')
    op.drop_table('scene_outlines')
    op.drop_table('chapter_outlines')
    op.drop_table('story_outlines')
    op.drop_table('api_calls')
    op.drop_table('stories')
    op.drop_table('queries')
    op.drop_table('users')
    # ### end Alembic commands ###
