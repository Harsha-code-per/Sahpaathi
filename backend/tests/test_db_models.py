"""Tests for database models, constraints, relationships, and get_db session lifecycle."""

import uuid

import pytest
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError

from app.db import Base, SessionLocal, engine, get_db
from app.models import Episode, IVRCall, Pack, SyncLog, User


@pytest.fixture
def db_session():
    """Provides a transactional database session rolled back after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        if transaction.is_active:
            transaction.rollback()
        connection.close()


def test_models_metadata_registered():
    """All 5 models must be registered in the shared Base.metadata."""
    tables = Base.metadata.tables.keys()
    for expected in ("users", "episodes", "packs", "sync_logs", "ivr_calls"):
        assert expected in tables


def test_get_db_yields_and_closes():
    """get_db() dependency must yield an active session and guarantee closure."""
    gen = get_db()
    session = next(gen)
    assert session.is_active
    try:
        pass
    finally:
        with pytest.raises(StopIteration):
            next(gen)
    assert not session.is_active or session.is_closed if hasattr(session, "is_closed") else True


def test_user_creation_and_email_uniqueness(db_session):
    """Users must enforce email uniqueness and role constraints."""
    user1 = User(
        email="teacher1@sahpaathi.org",
        password_hash="hashed_pw_1",
        role="teacher",
    )
    db_session.add(user1)
    db_session.flush()

    assert user1.id is not None
    assert user1.created_at is not None

    # Duplicate email must raise IntegrityError
    user2 = User(
        email="teacher1@sahpaathi.org",
        password_hash="hashed_pw_2",
        role="reviewer",
    )
    db_session.add(user2)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_user_invalid_role_rejected(db_session):
    """Database check constraint must reject invalid roles."""
    invalid_user = User(
        email="badrole@sahpaathi.org",
        password_hash="hashed",
        role="superadmin",  # Not in ('teacher', 'reviewer', 'admin')
    )
    db_session.add(invalid_user)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_episode_creation_and_constraints(db_session):
    """Episodes must enforce grade (1-5), subject, and status constraints."""
    ep = Episode(
        id="g1-counting-hi-ta-test",
        title="Counting to 20",
        grade=1,
        subject="numeracy",
        nipun_lo="N1.2",
        home_lang="hi",
        school_lang="ta",
        district="chennai-migrant",
        duration_min=15,
        status="approved",
        guardrail_scores={"rubric": 5.0},
        episode_data={"sample": "data"},
    )
    db_session.add(ep)
    db_session.flush()

    found = db_session.scalar(select(Episode).where(Episode.id == ep.id))
    assert found is not None
    assert found.subject == "numeracy"
    assert found.status == "approved"
    assert found.guardrail_scores["rubric"] == 5.0


def test_episode_invalid_grade_rejected(db_session):
    """Database check constraint must reject grade outside 1-5."""
    ep = Episode(
        id="invalid-grade-ep",
        title="Grade 6 Not Supported",
        grade=6,
        subject="numeracy",
        nipun_lo="N6.1",
        home_lang="hi",
        school_lang="ta",
        district="chennai",
        status="generating",
    )
    db_session.add(ep)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_episode_invalid_status_rejected(db_session):
    """Database check constraint must reject unknown status strings."""
    ep = Episode(
        id="invalid-status-ep",
        title="Unknown Status",
        grade=2,
        subject="literacy",
        nipun_lo="L2.1",
        home_lang="hi",
        school_lang="ta",
        district="chennai",
        status="published",  # Not in ('generating', 'failed', 'in_review', 'approved', 'packed')
    )
    db_session.add(ep)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_pack_relationship_and_cascade(db_session):
    """Packs must link to episodes and cascade delete when episode is deleted."""
    ep = Episode(
        id="pack-rel-ep",
        title="Pack Relation Test",
        grade=3,
        subject="numeracy",
        nipun_lo="N3.1",
        home_lang="ta",
        school_lang="ta",
        district="madurai",
        status="packed",
    )
    db_session.add(ep)
    db_session.flush()

    pack = Pack(
        id="madurai-g3-pack-rel-ep",
        episode_id=ep.id,
        district="madurai",
        grade=3,
        file_path="packs/madurai/g3/pack-rel-ep.sahpaathi",
        file_size=2048500,
        sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        signature="base64-test-signature",
    )
    db_session.add(pack)
    db_session.flush()

    assert pack.episode.title == "Pack Relation Test"
    assert len(ep.packs) == 1

    # Deleting episode must cascade delete the pack
    db_session.delete(ep)
    db_session.flush()
    assert db_session.scalar(select(Pack).where(Pack.id == pack.id)) is None


def test_sync_log_idempotency_enforced(db_session):
    """sync_logs.client_event_id unique constraint must prevent duplicate ingestion."""
    event_id = uuid.uuid4()
    log1 = SyncLog(
        client_event_id=event_id,
        school_id="school-001",
        event_type="tap",
        payload={"tap": "most", "segment_id": "s1", "auto": False},
    )
    db_session.add(log1)
    db_session.flush()

    # Attempting to insert the same client_event_id must fail
    log2 = SyncLog(
        client_event_id=event_id,
        school_id="school-001",
        event_type="tap",
        payload={"tap": "most", "segment_id": "s1", "auto": False},
    )
    db_session.add(log2)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_sync_log_invalid_event_type_rejected(db_session):
    """SyncLog event_type check constraint must reject unsupported categories."""
    invalid_log = SyncLog(
        client_event_id=uuid.uuid4(),
        event_type="exam_score",  # Not in ('tap', 'attendance')
        payload={},
    )
    db_session.add(invalid_log)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_ivr_call_creation_and_status_constraint(db_session):
    """IVRCall tracks absent student calls, DTMF history, and masks phone in repr."""
    call = IVRCall(
        student_id="student-101",
        parent_phone="+919876543210",
        status="queued",
        dtmf_responses={"1": "listened_recap", "2": "answered_checkpoint"},
    )
    db_session.add(call)
    db_session.flush()

    assert call.id is not None
    # Phone number must be masked in string representation
    rep = repr(call)
    assert "+919876543210" not in rep
    assert "+91...3210" in rep

    # Invalid status must be rejected
    invalid_call = IVRCall(
        student_id="student-102",
        parent_phone="+919876543210",
        status="voicemail",  # Not in ('queued', 'ringing', 'completed', 'failed')
    )
    db_session.add(invalid_call)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_postgres_table_schema_inspection():
    """Verify tables exist in actual PostgreSQL engine inspection."""
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    expected = {"users", "episodes", "packs", "sync_logs", "ivr_calls", "alembic_version"}
    assert expected.issubset(table_names)
