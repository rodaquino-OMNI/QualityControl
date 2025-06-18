"""
Pytest configuration and fixtures for AI service tests.
"""
import os
import sys
from typing import Generator, AsyncGenerator
import pytest
import asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from fastapi import FastAPI
import redis.asyncio as redis
from unittest.mock import Mock, AsyncMock

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import create_app
from app.config import get_settings
from app.database import Base
from app.models import User, AuditCase, AIAnalysis

# Override settings for testing
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["REDIS_URL"] = "redis://localhost:6379/15"
os.environ["JWT_SECRET"] = "test-secret-key"
os.environ["OPENAI_API_KEY"] = "test-api-key"


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def test_app() -> FastAPI:
    """Create a test FastAPI application."""
    app = create_app()
    return app


@pytest.fixture(scope="function")
async def async_engine():
    """Create an async SQLAlchemy engine for testing."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        future=True,
    )
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    await engine.dispose()


@pytest.fixture(scope="function")
async def async_session(async_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create an async database session for testing."""
    async_session_maker = sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async with async_session_maker() as session:
        yield session


@pytest.fixture(scope="function")
async def client(test_app: FastAPI, async_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client."""
    async with AsyncClient(app=test_app, base_url="http://test") as ac:
        yield ac


@pytest.fixture(scope="function")
async def redis_client() -> AsyncGenerator[redis.Redis, None]:
    """Create a Redis client for testing."""
    client = redis.Redis(
        host="localhost",
        port=6379,
        db=15,  # Use a separate DB for tests
        decode_responses=True,
    )
    
    # Clear the test database
    await client.flushdb()
    
    yield client
    
    await client.close()


@pytest.fixture
async def auth_headers(client: AsyncClient) -> dict:
    """Create authentication headers for testing."""
    # Create a test user
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "test@example.com",
            "password": "TestPassword123!",
            "name": "Test User",
            "role": "auditor",
        },
    )
    
    # Login to get token
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "test@example.com",
            "password": "TestPassword123!",
        },
    )
    
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def mock_openai_client():
    """Mock OpenAI client for testing."""
    mock = AsyncMock()
    
    # Mock chat completion
    mock.chat.completions.create = AsyncMock(
        return_value=Mock(
            choices=[
                Mock(
                    message=Mock(
                        content="This is a mocked AI response for testing."
                    )
                )
            ]
        )
    )
    
    # Mock embeddings
    mock.embeddings.create = AsyncMock(
        return_value=Mock(
            data=[
                Mock(embedding=[0.1] * 1536)  # Mock embedding vector
            ]
        )
    )
    
    return mock


@pytest.fixture
def mock_langchain():
    """Mock LangChain components for testing."""
    from unittest.mock import patch
    
    with patch("langchain.chat_models.ChatOpenAI") as mock_chat:
        mock_instance = Mock()
        mock_instance.apredict = AsyncMock(
            return_value="Mocked LangChain response"
        )
        mock_chat.return_value = mock_instance
        yield mock_chat


@pytest.fixture
async def sample_user(async_session: AsyncSession) -> User:
    """Create a sample user for testing."""
    user = User(
        email="sample@example.com",
        hashed_password="$2b$12$sample_hashed_password",
        name="Sample User",
        role="auditor",
        is_active=True,
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    return user


@pytest.fixture
async def sample_case(async_session: AsyncSession, sample_user: User) -> AuditCase:
    """Create a sample audit case for testing."""
    case = AuditCase(
        title="Sample Medical Audit Case",
        description="Test case for medical record audit",
        status="pending",
        priority="high",
        assigned_to_id=sample_user.id,
        patient_id="TEST123",
        medical_record_number="MRN123456",
    )
    async_session.add(case)
    await async_session.commit()
    await async_session.refresh(case)
    return case


@pytest.fixture
def mock_ml_model():
    """Mock machine learning model for testing."""
    mock = Mock()
    mock.predict = Mock(return_value={
        "risk_score": 0.75,
        "confidence": 0.85,
        "factors": ["high_complexity", "multiple_conditions"],
    })
    mock.predict_proba = Mock(return_value=[[0.25, 0.75]])
    return mock


# Test data fixtures
@pytest.fixture
def valid_case_data():
    """Valid case data for testing."""
    return {
        "title": "Test Medical Audit",
        "description": "Patient with complex medical history",
        "priority": "high",
        "patient_id": "PT123456",
        "medical_record_number": "MRN789012",
        "diagnosis_codes": ["E11.9", "I10", "J44.0"],
        "procedure_codes": ["99213", "93000"],
    }


@pytest.fixture
def valid_ai_analysis_request():
    """Valid AI analysis request data."""
    return {
        "case_id": 1,
        "analysis_type": "risk_assessment",
        "parameters": {
            "include_recommendations": True,
            "detail_level": "comprehensive",
        },
    }


# Utility functions for testing
def create_test_file(content: str, filename: str = "test.txt") -> bytes:
    """Create a test file content."""
    return content.encode("utf-8")


async def create_test_cases(
    session: AsyncSession, 
    user: User, 
    count: int = 5
) -> list[AuditCase]:
    """Create multiple test cases."""
    cases = []
    for i in range(count):
        case = AuditCase(
            title=f"Test Case {i+1}",
            description=f"Description for test case {i+1}",
            status="pending" if i % 2 == 0 else "in_progress",
            priority="high" if i % 3 == 0 else "medium",
            assigned_to_id=user.id,
            patient_id=f"PT{i+1:06d}",
        )
        session.add(case)
        cases.append(case)
    
    await session.commit()
    for case in cases:
        await session.refresh(case)
    
    return cases