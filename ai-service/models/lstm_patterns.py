"""
LSTM Pattern Analysis Model for Medical Treatment Sequences
"""
import torch
import torch.nn as nn
import numpy as np
from typing import Any, Dict, List, Optional, Tuple
import time
from loguru import logger
from sklearn.preprocessing import MinMaxScaler

from .base import BaseAIModel, ModelInput, ModelPrediction


class LSTMModel(nn.Module):
    """LSTM neural network for sequence analysis."""
    
    def __init__(self, input_dim: int, hidden_dim: int, output_dim: int, num_layers: int = 2):
        super(LSTMModel, self).__init__()
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        
        self.lstm = nn.LSTM(input_dim, hidden_dim, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_dim, output_dim)
        self.sigmoid = nn.Sigmoid()
    
    def forward(self, x):
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_dim)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_dim)
        
        out, _ = self.lstm(x, (h0, c0))
        out = self.fc(out[:, -1, :])
        out = self.sigmoid(out)
        return out


class LSTMPatternModel(BaseAIModel):
    """LSTM model for analyzing medical treatment patterns and sequences."""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.sequence_length = config.get("sequence_length", 30)
        self.input_features = config.get("features", [])
        self.hidden_dim = config.get("output_dimensions", 128)
        self.model = None
        self.scaler = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.pattern_categories = [
            "normal_progression",
            "rapid_escalation",
            "treatment_cycling",
            "unnecessary_repetition",
            "protocol_deviation"
        ]
    
    async def load_model(self) -> None:
        """Load or initialize LSTM model."""
        try:
            logger.info("Loading LSTM pattern analysis model")
            
            # For demo, create a simple model
            self._create_demo_model()
            
            self.is_loaded = True
            logger.info("LSTM pattern model loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load LSTM model: {e}")
            raise
    
    def _create_demo_model(self):
        """Create a demo LSTM model."""
        input_dim = len(self.input_features)
        output_dim = len(self.pattern_categories)
        
        self.model = LSTMModel(
            input_dim=input_dim,
            hidden_dim=self.hidden_dim,
            output_dim=output_dim,
            num_layers=2
        ).to(self.device)
        
        self.scaler = MinMaxScaler()
        
        # Train with synthetic data
        self._train_demo_model()
    
    def _train_demo_model(self):
        """Train model with synthetic data."""
        # Generate synthetic sequences
        n_samples = 500
        sequences = []
        labels = []
        
        for _ in range(n_samples):
            # Create different pattern types
            pattern_type = np.random.choice(len(self.pattern_categories))
            sequence = self._generate_synthetic_sequence(pattern_type)
            sequences.append(sequence)
            
            # One-hot encode label
            label = np.zeros(len(self.pattern_categories))
            label[pattern_type] = 1
            labels.append(label)
        
        # Convert to numpy arrays
        X = np.array(sequences)
        y = np.array(labels)
        
        # Reshape for scaler
        n_samples, seq_len, n_features = X.shape
        X_reshaped = X.reshape(-1, n_features)
        X_scaled = self.scaler.fit_transform(X_reshaped)
        X_scaled = X_scaled.reshape(n_samples, seq_len, n_features)
        
        # Convert to tensors
        X_tensor = torch.FloatTensor(X_scaled).to(self.device)
        y_tensor = torch.FloatTensor(y).to(self.device)
        
        # Simple training loop
        optimizer = torch.optim.Adam(self.model.parameters(), lr=0.001)
        criterion = nn.BCELoss()
        
        self.model.train()
        for epoch in range(50):
            optimizer.zero_grad()
            outputs = self.model(X_tensor)
            loss = criterion(outputs, y_tensor)
            loss.backward()
            optimizer.step()
        
        self.model.eval()
    
    def _generate_synthetic_sequence(self, pattern_type: int) -> np.ndarray:
        """Generate synthetic sequence based on pattern type."""
        sequence = np.random.randn(self.sequence_length, len(self.input_features))
        
        if pattern_type == 0:  # normal_progression
            # Gradual changes
            for i in range(1, self.sequence_length):
                sequence[i] = sequence[i-1] + np.random.randn(len(self.input_features)) * 0.1
        
        elif pattern_type == 1:  # rapid_escalation
            # Sharp increases
            for i in range(self.sequence_length // 2, self.sequence_length):
                sequence[i] += i * 0.1
        
        elif pattern_type == 2:  # treatment_cycling
            # Cyclic pattern
            for i in range(self.sequence_length):
                sequence[i] += np.sin(i * 0.5) * 2
        
        elif pattern_type == 3:  # unnecessary_repetition
            # Repeated values
            base = sequence[0]
            for i in range(self.sequence_length):
                if i % 5 == 0:
                    sequence[i] = base + np.random.randn(len(self.input_features)) * 0.05
        
        elif pattern_type == 4:  # protocol_deviation
            # Random spikes
            for i in range(0, self.sequence_length, 7):
                sequence[i] += np.random.randn(len(self.input_features)) * 3
        
        return sequence
    
    async def predict(self, input_data: ModelInput) -> ModelPrediction:
        """Analyze treatment sequence patterns."""
        start_time = time.time()
        
        # Extract sequence data
        sequence_data = self._extract_sequence(input_data)
        
        if sequence_data is None or len(sequence_data) < self.sequence_length:
            return self._create_insufficient_data_response(start_time)
        
        # Prepare sequence for model
        prepared_sequence = self._prepare_sequence(sequence_data)
        
        # Scale the sequence
        seq_reshaped = prepared_sequence.reshape(-1, len(self.input_features))
        seq_scaled = self.scaler.transform(seq_reshaped)
        seq_scaled = seq_scaled.reshape(1, self.sequence_length, len(self.input_features))
        
        # Convert to tensor
        seq_tensor = torch.FloatTensor(seq_scaled).to(self.device)
        
        # Get predictions
        with torch.no_grad():
            pattern_probs = self.model(seq_tensor)
        
        # Process results
        pattern_scores = pattern_probs.cpu().numpy()[0]
        detected_patterns = self._identify_patterns(pattern_scores)
        
        # Calculate risk metrics
        risk_metrics = self._calculate_risk_metrics(sequence_data, detected_patterns)
        
        processing_time = (time.time() - start_time) * 1000
        
        return ModelPrediction(
            model_name=self.model_name,
            model_version=self.model_version,
            prediction={
                "pattern_scores": {cat: float(score) for cat, score in 
                                 zip(self.pattern_categories, pattern_scores)},
                "detected_patterns": detected_patterns,
                "risk_metrics": risk_metrics,
                "sequence_analysis": self._analyze_sequence_trends(sequence_data),
                "recommendations": self._generate_recommendations(detected_patterns, risk_metrics)
            },
            confidence=float(np.max(pattern_scores)),
            explanation=self._generate_explanation(detected_patterns, risk_metrics),
            features_used=self.input_features,
            processing_time_ms=processing_time
        )
    
    def _extract_sequence(self, input_data: ModelInput) -> Optional[List[Dict[str, Any]]]:
        """Extract treatment sequence from input data."""
        treatment_history = input_data.data.get("treatment_history", [])
        
        if not treatment_history:
            return None
        
        # Sort by date and take last N records
        sorted_history = sorted(treatment_history, key=lambda x: x.get("date", ""))
        return sorted_history[-self.sequence_length:]
    
    def _prepare_sequence(self, sequence_data: List[Dict[str, Any]]) -> np.ndarray:
        """Prepare sequence data for LSTM input."""
        prepared = []
        
        for record in sequence_data:
            features = []
            
            # Extract features based on configuration
            for feature_name in self.input_features:
                if feature_name == "procedure_sequences":
                    # Convert procedure code to numeric
                    proc_code = record.get("procedure_code", "0")
                    features.append(float(hash(proc_code) % 1000) / 1000)
                
                elif feature_name == "diagnosis_progressions":
                    # Convert diagnosis to numeric
                    diag_code = record.get("diagnosis_code", "0")
                    features.append(float(hash(diag_code) % 1000) / 1000)
                
                elif feature_name == "treatment_patterns":
                    # Treatment type encoding
                    treatment_type = record.get("treatment_type", 0)
                    features.append(float(treatment_type))
                
                elif feature_name == "cost_trajectories":
                    # Normalized cost
                    cost = record.get("cost", 0)
                    features.append(min(cost / 10000, 10.0))  # Cap at 10
            
            prepared.append(features)
        
        # Pad sequence if necessary
        while len(prepared) < self.sequence_length:
            prepared.insert(0, [0] * len(self.input_features))
        
        return np.array(prepared)
    
    def _identify_patterns(self, pattern_scores: np.ndarray) -> List[Dict[str, Any]]:
        """Identify significant patterns from scores."""
        patterns = []
        threshold = 0.5
        
        for i, (category, score) in enumerate(zip(self.pattern_categories, pattern_scores)):
            if score > threshold:
                patterns.append({
                    "type": category,
                    "confidence": float(score),
                    "severity": self._determine_severity(category, score)
                })
        
        return sorted(patterns, key=lambda x: x["confidence"], reverse=True)
    
    def _calculate_risk_metrics(self, sequence_data: List[Dict], 
                               patterns: List[Dict]) -> Dict[str, float]:
        """Calculate risk metrics from sequence and patterns."""
        metrics = {
            "sequence_volatility": self._calculate_volatility(sequence_data),
            "cost_acceleration": self._calculate_cost_acceleration(sequence_data),
            "treatment_complexity": self._calculate_complexity(sequence_data),
            "protocol_adherence": self._calculate_protocol_adherence(sequence_data)
        }
        
        # Adjust based on detected patterns
        if any(p["type"] == "rapid_escalation" for p in patterns):
            metrics["escalation_risk"] = 0.8
        
        if any(p["type"] == "unnecessary_repetition" for p in patterns):
            metrics["efficiency_concern"] = 0.7
        
        return metrics
    
    def _calculate_volatility(self, sequence: List[Dict]) -> float:
        """Calculate sequence volatility."""
        if len(sequence) < 2:
            return 0.0
        
        costs = [r.get("cost", 0) for r in sequence]
        if len(costs) > 1:
            changes = np.diff(costs)
            return float(np.std(changes) / (np.mean(costs) + 1))
        return 0.0
    
    def _calculate_cost_acceleration(self, sequence: List[Dict]) -> float:
        """Calculate cost acceleration over time."""
        costs = [r.get("cost", 0) for r in sequence]
        if len(costs) > 2:
            first_half_avg = np.mean(costs[:len(costs)//2])
            second_half_avg = np.mean(costs[len(costs)//2:])
            if first_half_avg > 0:
                return float((second_half_avg - first_half_avg) / first_half_avg)
        return 0.0
    
    def _calculate_complexity(self, sequence: List[Dict]) -> float:
        """Calculate treatment complexity score."""
        unique_procedures = len(set(r.get("procedure_code", "") for r in sequence))
        unique_diagnoses = len(set(r.get("diagnosis_code", "") for r in sequence))
        
        complexity = (unique_procedures + unique_diagnoses) / (len(sequence) + 1)
        return min(complexity, 1.0)
    
    def _calculate_protocol_adherence(self, sequence: List[Dict]) -> float:
        """Calculate protocol adherence score."""
        # Simplified - in production, check against actual protocols
        standard_procedures = {"P001", "P002", "P003", "P004", "P005"}
        
        procedure_codes = [r.get("procedure_code", "") for r in sequence]
        adherent_count = sum(1 for p in procedure_codes if p in standard_procedures)
        
        return adherent_count / (len(procedure_codes) + 1)
    
    def _analyze_sequence_trends(self, sequence: List[Dict]) -> Dict[str, Any]:
        """Analyze trends in the sequence."""
        costs = [r.get("cost", 0) for r in sequence]
        dates = [r.get("date", "") for r in sequence]
        
        return {
            "trend_direction": "increasing" if len(costs) > 1 and costs[-1] > costs[0] else "stable",
            "total_cost": sum(costs),
            "average_cost": np.mean(costs) if costs else 0,
            "max_cost": max(costs) if costs else 0,
            "sequence_duration_days": self._calculate_duration(dates)
        }
    
    def _calculate_duration(self, dates: List[str]) -> int:
        """Calculate duration in days between first and last date."""
        # Simplified - in production, use proper date parsing
        return len(dates) * 7  # Assume weekly intervals
    
    def _determine_severity(self, pattern_type: str, score: float) -> str:
        """Determine severity of detected pattern."""
        severity_map = {
            "normal_progression": "low",
            "rapid_escalation": "high" if score > 0.8 else "medium",
            "treatment_cycling": "medium",
            "unnecessary_repetition": "medium" if score > 0.7 else "low",
            "protocol_deviation": "high" if score > 0.7 else "medium"
        }
        return severity_map.get(pattern_type, "low")
    
    def _generate_recommendations(self, patterns: List[Dict], 
                                metrics: Dict[str, float]) -> List[str]:
        """Generate recommendations based on patterns and metrics."""
        recommendations = []
        
        for pattern in patterns:
            if pattern["type"] == "rapid_escalation":
                recommendations.append("Revisar necessidade de escalação rápida do tratamento")
            elif pattern["type"] == "treatment_cycling":
                recommendations.append("Avaliar eficácia do tratamento atual")
            elif pattern["type"] == "unnecessary_repetition":
                recommendations.append("Considerar consolidação de procedimentos repetidos")
            elif pattern["type"] == "protocol_deviation":
                recommendations.append("Verificar aderência aos protocolos clínicos estabelecidos")
        
        if metrics.get("cost_acceleration", 0) > 0.5:
            recommendations.append("Monitorar aceleração dos custos do tratamento")
        
        if metrics.get("treatment_complexity", 0) > 0.7:
            recommendations.append("Avaliar complexidade do plano de tratamento")
        
        return recommendations[:5]  # Top 5 recommendations
    
    def _generate_explanation(self, patterns: List[Dict], metrics: Dict[str, float]) -> str:
        """Generate explanation of pattern analysis."""
        parts = []
        
        if patterns:
            top_pattern = patterns[0]
            parts.append(
                f"Padrão principal detectado: {top_pattern['type'].replace('_', ' ').title()} "
                f"(confiança: {top_pattern['confidence']:.2%})"
            )
        
        volatility = metrics.get("sequence_volatility", 0)
        if volatility > 0.5:
            parts.append("Alta volatilidade na sequência de tratamentos")
        
        complexity = metrics.get("treatment_complexity", 0)
        if complexity > 0.7:
            parts.append("Complexidade elevada no histórico de tratamentos")
        
        return " | ".join(parts) if parts else "Padrão de tratamento dentro da normalidade"
    
    def _create_insufficient_data_response(self, start_time: float) -> ModelPrediction:
        """Create response when insufficient data is available."""
        processing_time = (time.time() - start_time) * 1000
        
        return ModelPrediction(
            model_name=self.model_name,
            model_version=self.model_version,
            prediction={
                "status": "insufficient_data",
                "message": f"Necessário histórico de pelo menos {self.sequence_length} registros"
            },
            confidence=0.0,
            explanation="Dados insuficientes para análise de padrões",
            processing_time_ms=processing_time
        )
    
    async def validate_input(self, input_data: ModelInput) -> Tuple[bool, Optional[str]]:
        """Validate input data for LSTM processing."""
        if "treatment_history" not in input_data.data:
            return False, "Campo 'treatment_history' é obrigatório"
        
        history = input_data.data.get("treatment_history", [])
        if not isinstance(history, list):
            return False, "'treatment_history' deve ser uma lista"
        
        if len(history) == 0:
            return False, "Histórico de tratamento vazio"
        
        # Validate structure of history records
        for record in history[:5]:  # Check first 5 records
            if not isinstance(record, dict):
                return False, "Cada registro do histórico deve ser um dicionário"
            
            if "date" not in record or "procedure_code" not in record:
                return False, "Registros devem conter 'date' e 'procedure_code'"
        
        return True, None