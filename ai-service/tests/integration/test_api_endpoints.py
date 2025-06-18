"""
Integration tests for AI service API endpoints.
"""
import pytest
from httpx import AsyncClient
from unittest.mock import patch, Mock
import json


class TestAuthEndpoints:
    """Test authentication endpoints."""
    
    @pytest.mark.asyncio
    async def test_register_user(self, client: AsyncClient):
        """Test user registration."""
        # Arrange
        user_data = {
            "email": "newuser@example.com",
            "password": "SecurePass123!",
            "name": "New User",
            "role": "auditor",
        }
        
        # Act
        response = await client.post("/api/v1/auth/register", json=user_data)
        
        # Assert
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == user_data["email"]
        assert data["name"] == user_data["name"]
        assert "password" not in data
    
    @pytest.mark.asyncio
    async def test_login(self, client: AsyncClient):
        """Test user login."""
        # First register a user
        await client.post(
            "/api/v1/auth/register",
            json={
                "email": "login@example.com",
                "password": "TestPass123!",
                "name": "Login Test",
                "role": "auditor",
            },
        )
        
        # Act
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "login@example.com",
                "password": "TestPass123!",
            },
        )
        
        # Assert
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "token_type" in data
        assert data["token_type"] == "bearer"
    
    @pytest.mark.asyncio
    async def test_invalid_login(self, client: AsyncClient):
        """Test login with invalid credentials."""
        # Act
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "nonexistent@example.com",
                "password": "WrongPass123!",
            },
        )
        
        # Assert
        assert response.status_code == 401
        assert "Invalid credentials" in response.json()["detail"]


class TestAIAnalysisEndpoints:
    """Test AI analysis endpoints."""
    
    @pytest.mark.asyncio
    async def test_analyze_case(
        self, 
        client: AsyncClient, 
        auth_headers: dict,
        sample_case,
        mock_openai_client
    ):
        """Test case analysis endpoint."""
        # Arrange
        with patch("app.services.ai_service.AIService") as mock_service:
            mock_instance = Mock()
            mock_instance.analyze_case = Mock(
                return_value={
                    "risk_score": 0.75,
                    "findings": ["Finding 1", "Finding 2"],
                    "recommendations": ["Recommendation 1"],
                }
            )
            mock_service.return_value = mock_instance
            
            # Act
            response = await client.post(
                f"/api/v1/ai/analyze/{sample_case.id}",
                headers=auth_headers,
                json={
                    "analysis_type": "comprehensive",
                    "include_recommendations": True,
                },
            )
        
        # Assert
        assert response.status_code == 200
        data = response.json()
        assert "risk_score" in data
        assert "findings" in data
        assert "recommendations" in data
        assert data["risk_score"] == 0.75
    
    @pytest.mark.asyncio
    async def test_batch_analysis(
        self, 
        client: AsyncClient, 
        auth_headers: dict,
        async_session,
        sample_user
    ):
        """Test batch case analysis."""
        # Create multiple cases
        from tests.conftest import create_test_cases
        cases = await create_test_cases(async_session, sample_user, count=3)
        case_ids = [case.id for case in cases]
        
        with patch("app.services.ai_service.AIService") as mock_service:
            mock_instance = Mock()
            mock_instance.batch_analyze_cases = Mock(
                return_value=[
                    {"case_id": case_id, "risk_score": 0.5}
                    for case_id in case_ids
                ]
            )
            mock_service.return_value = mock_instance
            
            # Act
            response = await client.post(
                "/api/v1/ai/analyze/batch",
                headers=auth_headers,
                json={"case_ids": case_ids},
            )
        
        # Assert
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        assert all("risk_score" in result for result in data)
    
    @pytest.mark.asyncio
    async def test_generate_report(
        self, 
        client: AsyncClient, 
        auth_headers: dict,
        sample_case
    ):
        """Test report generation endpoint."""
        # Arrange
        with patch("app.services.ai_service.AIService") as mock_service:
            mock_instance = Mock()
            mock_instance.generate_audit_report = Mock(
                return_value="# Medical Audit Report\n\nRisk Score: 0.75"
            )
            mock_service.return_value = mock_instance
            
            # Act
            response = await client.post(
                f"/api/v1/ai/report/{sample_case.id}",
                headers=auth_headers,
                json={"format": "markdown"},
            )
        
        # Assert
        assert response.status_code == 200
        data = response.json()
        assert "report" in data
        assert "Medical Audit Report" in data["report"]
    
    @pytest.mark.asyncio
    async def test_similarity_search(
        self, 
        client: AsyncClient, 
        auth_headers: dict,
        sample_case
    ):
        """Test case similarity search."""
        # Arrange
        with patch("app.services.ai_service.AIService") as mock_service:
            mock_instance = Mock()
            mock_instance.find_similar_cases = Mock(
                return_value=[
                    {"case_id": 2, "similarity": 0.95, "title": "Similar Case 1"},
                    {"case_id": 3, "similarity": 0.89, "title": "Similar Case 2"},
                ]
            )
            mock_service.return_value = mock_instance
            
            # Act
            response = await client.post(
                f"/api/v1/ai/similar/{sample_case.id}",
                headers=auth_headers,
                json={"top_k": 5},
            )
        
        # Assert
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["similarity"] > data[1]["similarity"]


class TestMLEndpoints:
    """Test machine learning endpoints."""
    
    @pytest.mark.asyncio
    async def test_predict_risk(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test risk prediction endpoint."""
        # Arrange
        patient_data = {
            "age": 65,
            "diagnosis_codes": ["E11.9", "I10"],
            "procedure_codes": ["99213"],
            "num_medications": 5,
            "num_admissions": 2,
        }
        
        with patch("app.services.ml_service.RiskPredictor") as mock_predictor:
            mock_instance = Mock()
            mock_instance.predict = Mock(
                return_value={
                    "risk_score": 0.72,
                    "confidence": 0.88,
                    "risk_factors": ["age", "multiple_conditions"],
                }
            )
            mock_predictor.return_value = mock_instance
            
            # Act
            response = await client.post(
                "/api/v1/ml/predict/risk",
                headers=auth_headers,
                json=patient_data,
            )
        
        # Assert
        assert response.status_code == 200
        data = response.json()
        assert "risk_score" in data
        assert "confidence" in data
        assert 0 <= data["risk_score"] <= 1
    
    @pytest.mark.asyncio
    async def test_anomaly_detection(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test anomaly detection endpoint."""
        # Arrange
        medical_data = {
            "lab_results": {
                "glucose": 350,  # Abnormally high
                "blood_pressure": "180/120",
                "heart_rate": 45,  # Abnormally low
            },
            "medications": ["metformin", "insulin", "lisinopril"],
            "diagnosis_codes": ["E11.9"],
        }
        
        # Act
        response = await client.post(
            "/api/v1/ml/detect/anomalies",
            headers=auth_headers,
            json=medical_data,
        )
        
        # Assert
        assert response.status_code == 200
        data = response.json()
        assert "anomalies" in data
        assert len(data["anomalies"]) > 0


class TestFileUploadEndpoints:
    """Test file upload and processing endpoints."""
    
    @pytest.mark.asyncio
    async def test_upload_medical_record(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test medical record file upload."""
        # Arrange
        file_content = b"Sample medical record content"
        files = {
            "file": ("medical_record.pdf", file_content, "application/pdf")
        }
        
        # Act
        response = await client.post(
            "/api/v1/files/upload",
            headers=auth_headers,
            files=files,
            data={"case_id": "1", "file_type": "medical_record"},
        )
        
        # Assert
        assert response.status_code == 201
        data = response.json()
        assert "file_id" in data
        assert data["filename"] == "medical_record.pdf"
    
    @pytest.mark.asyncio
    async def test_process_uploaded_file(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test file processing after upload."""
        # First upload a file
        file_content = b"Patient: John Doe\nDiagnosis: Hypertension (I10)"
        files = {
            "file": ("clinical_note.txt", file_content, "text/plain")
        }
        
        upload_response = await client.post(
            "/api/v1/files/upload",
            headers=auth_headers,
            files=files,
            data={"case_id": "1", "file_type": "clinical_note"},
        )
        
        file_id = upload_response.json()["file_id"]
        
        # Process the file
        with patch("app.services.file_processor.FileProcessor") as mock_processor:
            mock_instance = Mock()
            mock_instance.process_file = Mock(
                return_value={
                    "extracted_text": "Patient: John Doe\nDiagnosis: Hypertension",
                    "entities": {
                        "patient_name": "John Doe",
                        "diagnosis_codes": ["I10"],
                    },
                }
            )
            mock_processor.return_value = mock_instance
            
            # Act
            response = await client.post(
                f"/api/v1/files/process/{file_id}",
                headers=auth_headers,
            )
        
        # Assert
        assert response.status_code == 200
        data = response.json()
        assert "extracted_text" in data
        assert "entities" in data


class TestHealthCheckEndpoints:
    """Test health check and monitoring endpoints."""
    
    @pytest.mark.asyncio
    async def test_health_check(self, client: AsyncClient):
        """Test basic health check endpoint."""
        # Act
        response = await client.get("/api/v1/health")
        
        # Assert
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data
    
    @pytest.mark.asyncio
    async def test_readiness_check(self, client: AsyncClient):
        """Test readiness check endpoint."""
        # Act
        response = await client.get("/api/v1/health/ready")
        
        # Assert
        assert response.status_code == 200
        data = response.json()
        assert "database" in data
        assert "redis" in data
        assert "ai_service" in data