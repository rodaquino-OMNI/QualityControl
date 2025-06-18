"""
Unit tests for AI service functionality.
"""
import pytest
from unittest.mock import Mock, AsyncMock, patch
import numpy as np

from app.services.ai_service import AIService
from app.models import AuditCase


class TestAIService:
    """Test cases for AIService class."""
    
    @pytest.fixture
    def ai_service(self, mock_openai_client):
        """Create AIService instance with mocked dependencies."""
        service = AIService()
        service.openai_client = mock_openai_client
        return service
    
    @pytest.mark.asyncio
    async def test_analyze_case(self, ai_service, sample_case):
        """Test case analysis functionality."""
        # Arrange
        expected_analysis = {
            "risk_score": 0.85,
            "findings": [
                "High complexity medical case",
                "Multiple chronic conditions identified",
            ],
            "recommendations": [
                "Detailed review of medication interactions",
                "Specialist consultation recommended",
            ],
        }
        
        ai_service.openai_client.chat.completions.create.return_value = Mock(
            choices=[Mock(message=Mock(content=str(expected_analysis)))]
        )
        
        # Act
        result = await ai_service.analyze_case(sample_case)
        
        # Assert
        assert result["risk_score"] == expected_analysis["risk_score"]
        assert len(result["findings"]) > 0
        assert len(result["recommendations"]) > 0
        ai_service.openai_client.chat.completions.create.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_generate_embeddings(self, ai_service):
        """Test embedding generation."""
        # Arrange
        text = "Patient presents with chronic conditions"
        expected_embedding = [0.1] * 1536
        
        ai_service.openai_client.embeddings.create.return_value = Mock(
            data=[Mock(embedding=expected_embedding)]
        )
        
        # Act
        result = await ai_service.generate_embeddings(text)
        
        # Assert
        assert isinstance(result, list)
        assert len(result) == 1536
        assert result == expected_embedding
    
    @pytest.mark.asyncio
    async def test_risk_assessment(self, ai_service, sample_case):
        """Test risk assessment calculation."""
        # Arrange
        case_data = {
            "diagnosis_codes": ["E11.9", "I10", "J44.0"],
            "procedure_codes": ["99213", "93000"],
            "patient_age": 65,
            "comorbidities": 3,
        }
        
        # Act
        risk_score = await ai_service.assess_risk(case_data)
        
        # Assert
        assert isinstance(risk_score, float)
        assert 0 <= risk_score <= 1
    
    @pytest.mark.asyncio
    async def test_generate_audit_report(self, ai_service, sample_case):
        """Test audit report generation."""
        # Arrange
        analysis_results = {
            "risk_score": 0.75,
            "findings": ["Finding 1", "Finding 2"],
            "recommendations": ["Recommendation 1"],
        }
        
        expected_report = """
        # Medical Audit Report
        
        ## Executive Summary
        Risk Score: 0.75 (High)
        
        ## Key Findings
        - Finding 1
        - Finding 2
        
        ## Recommendations
        - Recommendation 1
        """
        
        ai_service.openai_client.chat.completions.create.return_value = Mock(
            choices=[Mock(message=Mock(content=expected_report))]
        )
        
        # Act
        report = await ai_service.generate_audit_report(
            sample_case, 
            analysis_results
        )
        
        # Assert
        assert "Medical Audit Report" in report
        assert "Risk Score: 0.75" in report
        assert "Finding 1" in report
    
    @pytest.mark.asyncio
    async def test_similarity_search(self, ai_service):
        """Test similarity search functionality."""
        # Arrange
        query_embedding = [0.1] * 1536
        case_embeddings = [
            ([0.1] * 1536, "Case 1"),
            ([0.2] * 1536, "Case 2"),
            ([0.05] * 1536, "Case 3"),
        ]
        
        # Act
        similar_cases = await ai_service.find_similar_cases(
            query_embedding, 
            case_embeddings, 
            top_k=2
        )
        
        # Assert
        assert len(similar_cases) == 2
        assert similar_cases[0][1] == "Case 3"  # Most similar
        assert similar_cases[1][1] == "Case 1"  # Second most similar
    
    @pytest.mark.asyncio
    async def test_error_handling(self, ai_service):
        """Test error handling in AI service."""
        # Arrange
        ai_service.openai_client.chat.completions.create.side_effect = Exception(
            "API Error"
        )
        
        # Act & Assert
        with pytest.raises(Exception) as exc_info:
            await ai_service.analyze_case(Mock())
        
        assert "API Error" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_batch_analysis(self, ai_service):
        """Test batch case analysis."""
        # Arrange
        cases = [Mock(id=i, title=f"Case {i}") for i in range(3)]
        
        ai_service.openai_client.chat.completions.create.return_value = Mock(
            choices=[Mock(message=Mock(content='{"risk_score": 0.5}'))]
        )
        
        # Act
        results = await ai_service.batch_analyze_cases(cases)
        
        # Assert
        assert len(results) == 3
        assert all("risk_score" in result for result in results)
        assert ai_service.openai_client.chat.completions.create.call_count == 3


class TestMLModels:
    """Test cases for machine learning models."""
    
    @pytest.mark.asyncio
    async def test_risk_prediction_model(self, mock_ml_model):
        """Test risk prediction model."""
        # Arrange
        features = np.array([[65, 3, 5, 2, 1]])  # age, conditions, meds, procedures, admissions
        
        # Act
        prediction = mock_ml_model.predict(features)
        probability = mock_ml_model.predict_proba(features)
        
        # Assert
        assert "risk_score" in prediction
        assert 0 <= prediction["risk_score"] <= 1
        assert probability.shape == (1, 2)
    
    @pytest.mark.asyncio
    async def test_anomaly_detection(self):
        """Test anomaly detection in medical records."""
        # Arrange
        from app.services.ml_service import AnomalyDetector
        detector = AnomalyDetector()
        
        normal_data = np.random.normal(0, 1, (100, 10))
        anomaly = np.array([[10] * 10])  # Obvious anomaly
        
        # Act
        detector.fit(normal_data)
        normal_scores = detector.predict(normal_data)
        anomaly_score = detector.predict(anomaly)
        
        # Assert
        assert np.mean(normal_scores) < anomaly_score[0]
        assert anomaly_score[0] > detector.threshold


class TestNLPProcessing:
    """Test cases for NLP processing."""
    
    @pytest.mark.asyncio
    async def test_medical_entity_extraction(self):
        """Test medical entity extraction from text."""
        # Arrange
        from app.services.nlp_service import MedicalNLP
        nlp = MedicalNLP()
        
        text = """
        Patient diagnosed with Type 2 Diabetes Mellitus (E11.9) and 
        Hypertension (I10). Prescribed Metformin 500mg twice daily.
        """
        
        # Act
        entities = await nlp.extract_medical_entities(text)
        
        # Assert
        assert "conditions" in entities
        assert "medications" in entities
        assert "diagnosis_codes" in entities
        assert "E11.9" in entities["diagnosis_codes"]
        assert "I10" in entities["diagnosis_codes"]
    
    @pytest.mark.asyncio
    async def test_clinical_note_summarization(self, ai_service):
        """Test clinical note summarization."""
        # Arrange
        clinical_note = """
        Chief Complaint: Chest pain and shortness of breath
        
        History of Present Illness: 65-year-old male presents with 
        acute onset chest pain radiating to left arm. Associated with
        dyspnea and diaphoresis. Symptoms started 2 hours ago.
        
        Past Medical History: Hypertension, Hyperlipidemia, Type 2 DM
        
        Medications: Lisinopril 10mg daily, Atorvastatin 40mg daily,
        Metformin 1000mg twice daily
        
        Assessment: Possible acute coronary syndrome
        
        Plan: EKG, Troponin, Chest X-ray, Cardiology consult
        """
        
        expected_summary = "65yo male with acute chest pain, dyspnea..."
        
        ai_service.openai_client.chat.completions.create.return_value = Mock(
            choices=[Mock(message=Mock(content=expected_summary))]
        )
        
        # Act
        summary = await ai_service.summarize_clinical_note(clinical_note)
        
        # Assert
        assert len(summary) < len(clinical_note)
        assert "chest pain" in summary.lower()