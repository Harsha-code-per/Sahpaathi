"""Tests for authentication, JWT issuance, verification, role-based authorization, and seeding."""

import uuid
from datetime import timedelta
from typing import Annotated

import jwt
import pytest
from fastapi import APIRouter, Depends, status
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.auth.dependencies import get_current_user, require_role
from app.auth.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.config import Settings, settings
from app.db import SessionLocal, engine, get_db
from app.main import app
from app.models.user import User
from app.seed import seed_development_users

# Define test-only routes to verify get_current_user and require_role
auth_probe_router = APIRouter(prefix="/test-auth", tags=["test-auth"])

admin_role_dep = require_role("admin")
reviewer_or_admin_role_dep = require_role(["reviewer", "admin"])


@auth_probe_router.get("/me")
def endpoint_get_me(current_user: Annotated[User, Depends(get_current_user)]):
    return {"id": str(current_user.id), "email": current_user.email, "role": current_user.role}


@auth_probe_router.get("/admin-only")
def endpoint_admin_only(current_user: Annotated[User, Depends(admin_role_dep)]):
    return {"msg": "admin_granted", "role": current_user.role}


@auth_probe_router.get("/reviewer-or-admin")
def endpoint_reviewer_or_admin(
    current_user: Annotated[User, Depends(reviewer_or_admin_role_dep)],
):
    return {"msg": "reviewer_or_admin_granted", "role": current_user.role}


# Mount test router on the application for the test suite
app.include_router(auth_probe_router)


@pytest.fixture
def db_session():
    """Provides a transactional database session rolled back after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)

    def _override_get_db():
        yield session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield session
    finally:
        app.dependency_overrides.clear()
        session.close()
        if transaction.is_active:
            transaction.rollback()
        connection.close()


@pytest.fixture
def create_test_user(db_session):
    """Helper fixture to create test users within the transactional test session."""

    def _create(email: str, password: str = "TestPass123!", role: str = "teacher") -> User:
        user = User(
            id=uuid.uuid4(),
            email=email,
            password_hash=hash_password(password),
            role=role,
        )
        db_session.add(user)
        db_session.flush()
        return user

    return _create


# --- 1. Password Hashing & Verification Tests ---


def test_password_hash_and_verification():
    """Password hashing with Argon2 must verify correctly and reject wrong passwords."""
    raw = "MySecurePassword123!"
    hashed = hash_password(raw)
    assert hashed != raw
    assert verify_password(raw, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False
    assert verify_password("", hashed) is False
    assert verify_password(raw, "invalid_hash_format") is False


# --- 2. Token Creation & Decoding Tests ---


def test_token_creation_and_decoding():
    """Access token must contain sub, exp, and custom claims."""
    uid = str(uuid.uuid4())
    data = {"sub": uid, "email": "test@sahpaathi.org", "role": "teacher"}
    token = create_access_token(data, expires_delta=timedelta(minutes=30))
    decoded = decode_access_token(token)

    assert decoded["sub"] == uid
    assert decoded["email"] == "test@sahpaathi.org"
    assert decoded["role"] == "teacher"
    assert "exp" in decoded


def test_expired_token_rejected():
    """Expired token must raise jwt.ExpiredSignatureError on decode."""
    data = {"sub": str(uuid.uuid4()), "role": "teacher"}
    expired_token = create_access_token(data, expires_delta=timedelta(minutes=-5))
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(expired_token)


def test_tampered_token_rejected():
    """Token with invalid signature or modified claims must be rejected."""
    token = create_access_token({"sub": "user1"})
    # Tamper with signature
    tampered = token[:-5] + "XXXXX"
    with pytest.raises(jwt.PyJWTError):
        decode_access_token(tampered)


def test_wrong_algorithm_rejected():
    """Tokens signed with unapproved algorithms must be rejected."""
    payload = {"sub": "user1", "exp": 9999999999}
    # Encode with none algorithm
    none_token = jwt.encode(payload, key="", algorithm="none")
    with pytest.raises(jwt.PyJWTError):
        decode_access_token(none_token)


# --- 3. Login API Tests (POST /api/v1/auth/login) ---


def test_login_success_json(create_test_user):
    """POST /api/v1/auth/login with valid JSON credentials returns 200, JWT and role."""
    create_test_user("teacher.login@sahpaathi.org", "secret123", "teacher")
    client = TestClient(app)

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "teacher.login@sahpaathi.org", "password": "secret123"},
    )
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert body["role"] == "teacher"
    assert "password" not in str(body)

    # Token must decode and verify sub
    decoded = decode_access_token(body["access_token"])
    assert decoded["email"] == "teacher.login@sahpaathi.org"
    assert decoded["role"] == "teacher"


def test_login_success_form(create_test_user):
    """POST /api/v1/auth/login with OAuth2 form data returns 200 and token."""
    create_test_user("reviewer.form@sahpaathi.org", "reviewpass", "reviewer")
    client = TestClient(app)

    response = client.post(
        "/api/v1/auth/login",
        data={"username": "reviewer.form@sahpaathi.org", "password": "reviewpass"},
    )
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert "access_token" in body
    assert body["role"] == "reviewer"


def test_login_invalid_password(create_test_user):
    """POST /api/v1/auth/login with wrong password returns generic 401."""
    create_test_user("wrong.pw@sahpaathi.org", "realpassword")
    client = TestClient(app)

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "wrong.pw@sahpaathi.org", "password": "wrongpassword"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json() == {"detail": "Incorrect email or password"}


def test_login_nonexistent_user():
    """POST /api/v1/auth/login with non-existent email returns generic 401."""
    client = TestClient(app)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "ghost@sahpaathi.org", "password": "anypassword"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json() == {"detail": "Incorrect email or password"}


def test_login_missing_credentials():
    """POST /api/v1/auth/login with missing fields returns 401."""
    client = TestClient(app)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "", "password": ""},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


# --- 4. Role-Based Authorization & Dependency Tests ---


def test_protected_route_without_token():
    """Protected route without Authorization header must return 401."""
    client = TestClient(app)
    response = client.get("/test-auth/me")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_protected_route_with_invalid_token():
    """Protected route with invalid bearer token must return 401."""
    client = TestClient(app)
    response = client.get(
        "/test-auth/me",
        headers={"Authorization": "Bearer not-a-valid-token"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_protected_route_with_valid_token(create_test_user):
    """Protected route with valid token resolves and returns the current user."""
    user = create_test_user("authed.user@sahpaathi.org", "pass123", "teacher")
    token = create_access_token({"sub": str(user.id), "email": user.email, "role": user.role})
    client = TestClient(app)

    response = client.get(
        "/test-auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["id"] == str(user.id)
    assert response.json()["role"] == "teacher"


def test_role_authorization_admin_allowed(create_test_user):
    """require_role('admin') allows admin user."""
    admin = create_test_user("admin.user@sahpaathi.org", "adminpass", "admin")
    token = create_access_token({"sub": str(admin.id), "role": "admin"})
    client = TestClient(app)

    response = client.get(
        "/test-auth/admin-only",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["msg"] == "admin_granted"


def test_role_authorization_teacher_rejected_from_admin(create_test_user):
    """require_role('admin') rejects teacher user with 403 Forbidden."""
    teacher = create_test_user("teacher.denied@sahpaathi.org", "teachpass", "teacher")
    token = create_access_token({"sub": str(teacher.id), "role": "teacher"})
    client = TestClient(app)

    response = client.get(
        "/test-auth/admin-only",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert "not permitted" in response.json()["detail"].lower()


def test_role_authorization_multiple_allowed_roles(create_test_user):
    """require_role(['reviewer', 'admin']) allows reviewer and admin, rejects teacher."""
    reviewer = create_test_user("rev@sahpaathi.org", "revpass", "reviewer")
    admin = create_test_user("adm@sahpaathi.org", "admpass", "admin")
    teacher = create_test_user("tch@sahpaathi.org", "tchpass", "teacher")

    client = TestClient(app)

    rev_tok = create_access_token({"sub": str(reviewer.id)})
    adm_tok = create_access_token({"sub": str(admin.id)})
    tch_tok = create_access_token({"sub": str(teacher.id)})

    # Reviewer -> 200
    res_rev = client.get(
        "/test-auth/reviewer-or-admin", headers={"Authorization": f"Bearer {rev_tok}"}
    )
    assert res_rev.status_code == status.HTTP_200_OK

    # Admin -> 200
    res_adm = client.get(
        "/test-auth/reviewer-or-admin", headers={"Authorization": f"Bearer {adm_tok}"}
    )
    assert res_adm.status_code == status.HTTP_200_OK

    # Teacher -> 403
    res_tch = client.get(
        "/test-auth/reviewer-or-admin", headers={"Authorization": f"Bearer {tch_tok}"}
    )
    assert res_tch.status_code == status.HTTP_403_FORBIDDEN


# --- 5. Production Configuration Safety Tests ---


def test_production_secret_validation():
    """Settings must reject placeholder or weak JWT secret when environment is production."""
    with pytest.raises(ValidationError, match="In production, JWT_SECRET must be set"):
        Settings(environment="production", jwt_secret="dev-only-change-me")

    with pytest.raises(ValidationError, match="In production, JWT_SECRET must be set"):
        Settings(environment="production", jwt_secret="too-short-secret")

    # Valid 32+ character secret in production passes
    valid_prod = Settings(
        environment="production",
        jwt_secret="a-very-long-production-grade-secret-key-12345",
    )
    assert valid_prod.environment == "production"


# --- 6. Health & Readiness Unaffected Tests ---


def test_health_and_ready_public_unaffected():
    """GET /health and GET /ready must remain accessible without any auth header."""
    client = TestClient(app)

    res_health = client.get("/health")
    assert res_health.status_code == status.HTTP_200_OK
    assert res_health.json() == {"status": "ok"}

    res_ready = client.get("/ready")
    assert res_ready.status_code == status.HTTP_200_OK
    assert res_ready.json() == {"status": "ok", "db": "connected"}


# --- 7. Development Seeding Tests ---


def test_development_seeding_idempotent(monkeypatch):
    """Seeding test accounts creates accounts and subsequent run is idempotent."""
    monkeypatch.setenv("SEED_PASSWORD", "SuperDevPassword123!")
    monkeypatch.setattr(settings, "environment", "development")

    # First run
    results1 = seed_development_users()
    for email in ("teacher@sahpaathi.org", "reviewer@sahpaathi.org", "admin@sahpaathi.org"):
        assert results1[email] in ("created", "already_exists")

    # Second run must report already_exists and not duplicate
    results2 = seed_development_users()
    for email in ("teacher@sahpaathi.org", "reviewer@sahpaathi.org", "admin@sahpaathi.org"):
        assert results2[email] == "already_exists"


def test_seeding_refuses_in_production(monkeypatch):
    """Seeder must raise RuntimeError if run in a production environment."""
    monkeypatch.setenv("SEED_PASSWORD", "SuperDevPassword123!")
    monkeypatch.setattr(settings, "environment", "production")

    with pytest.raises(RuntimeError, match="Refusing to run seed script in production"):
        seed_development_users()


def test_seeding_refuses_without_passwords(monkeypatch):
    """Seeder must raise ValueError if no password is provided in environment."""
    monkeypatch.delenv("SEED_PASSWORD", raising=False)
    monkeypatch.delenv("SEED_TEACHER_PASSWORD", raising=False)
    monkeypatch.delenv("SEED_REVIEWER_PASSWORD", raising=False)
    monkeypatch.delenv("SEED_ADMIN_PASSWORD", raising=False)
    monkeypatch.setattr(settings, "environment", "development")

    with pytest.raises(ValueError, match="No password provided"):
        seed_development_users()
