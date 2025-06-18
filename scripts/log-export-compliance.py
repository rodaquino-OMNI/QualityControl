#!/usr/bin/env python3
"""
AUSTA Cockpit Log Export and Compliance Script
Automates log export for regulatory compliance and audit purposes
"""

import os
import sys
import json
import gzip
import hashlib
import argparse
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import csv
import sqlite3
from pathlib import Path

import requests
from elasticsearch import Elasticsearch
from cryptography.fernet import Fernet
import boto3
from azure.storage.blob import BlobServiceClient


class LogExportCompliance:
    """Handles log export and compliance procedures."""
    
    def __init__(self, config_file: str = "config/compliance-config.json"):
        """Initialize with configuration."""
        self.config = self._load_config(config_file)
        self.es_client = self._setup_elasticsearch()
        self.encryption_key = self._get_encryption_key()
        self.export_dir = Path(self.config.get("export_directory", "./exports"))
        self.export_dir.mkdir(parents=True, exist_ok=True)
        
    def _load_config(self, config_file: str) -> Dict[str, Any]:
        """Load configuration from file."""
        try:
            with open(config_file, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            # Default configuration
            return {
                "elasticsearch": {
                    "host": "http://localhost:9200",
                    "username": "elastic",
                    "password": "austa123"
                },
                "export_directory": "./exports",
                "encryption_enabled": True,
                "compression_enabled": True,
                "cloud_storage": {
                    "provider": "aws",  # aws, azure, gcp
                    "bucket": "austa-compliance-logs",
                    "enabled": False
                },
                "retention_policies": {
                    "security_logs": 2555,  # 7 years in days
                    "audit_logs": 2555,     # 7 years in days
                    "application_logs": 90,  # 90 days
                    "error_logs": 365       # 1 year
                },
                "compliance_standards": ["SOX", "HIPAA", "GDPR", "PCI-DSS"]
            }
    
    def _setup_elasticsearch(self) -> Elasticsearch:
        """Setup Elasticsearch client."""
        es_config = self.config["elasticsearch"]
        return Elasticsearch(
            [es_config["host"]],
            http_auth=(es_config["username"], es_config["password"]),
            verify_certs=False,
            ssl_show_warn=False
        )
    
    def _get_encryption_key(self) -> Optional[Fernet]:
        """Get encryption key for sensitive data."""
        if not self.config.get("encryption_enabled", True):
            return None
            
        key_file = Path("config/encryption.key")
        if key_file.exists():
            with open(key_file, 'rb') as f:
                key = f.read()
        else:
            key = Fernet.generate_key()
            key_file.parent.mkdir(parents=True, exist_ok=True)
            with open(key_file, 'wb') as f:
                f.write(key)
        
        return Fernet(key)
    
    def export_logs_by_date_range(
        self, 
        start_date: datetime, 
        end_date: datetime,
        log_types: List[str] = None,
        export_format: str = "json"
    ) -> Dict[str, str]:
        """Export logs for a specific date range."""
        
        if log_types is None:
            log_types = ["security", "audit", "application", "error"]
        
        results = {}
        
        for log_type in log_types:
            print(f"Exporting {log_type} logs from {start_date} to {end_date}...")
            
            # Query logs from Elasticsearch
            query = self._build_export_query(start_date, end_date, log_type)
            logs = self._fetch_logs_from_elasticsearch(query, f"austa-{log_type}-*")
            
            if logs:
                # Export logs
                export_path = self._export_logs_to_file(
                    logs, log_type, start_date, end_date, export_format
                )
                results[log_type] = export_path
                
                # Generate compliance report
                self._generate_compliance_report(logs, log_type, export_path)
                
        return results
    
    def export_user_data(self, user_id: str, start_date: datetime, end_date: datetime) -> str:
        """Export all data related to a specific user (GDPR compliance)."""
        
        print(f"Exporting data for user {user_id}...")
        
        # Query all logs related to the user
        query = {
            "query": {
                "bool": {
                    "must": [
                        {"range": {"@timestamp": {"gte": start_date.isoformat(), "lte": end_date.isoformat()}}},
                        {"term": {"userId": user_id}}
                    ]
                }
            },
            "sort": [{"@timestamp": {"order": "asc"}}]
        }
        
        all_user_logs = []
        indices = ["austa-*"]
        
        # Fetch logs from all indices
        for index in indices:
            try:
                response = self.es_client.search(
                    index=index,
                    body=query,
                    size=10000,
                    scroll='2m'
                )
                
                all_user_logs.extend(response['hits']['hits'])
                
                # Handle scrolling for large datasets
                scroll_id = response['_scroll_id']
                while True:
                    response = self.es_client.scroll(scroll_id=scroll_id, scroll='2m')
                    hits = response['hits']['hits']
                    if not hits:
                        break
                    all_user_logs.extend(hits)
                    
            except Exception as e:
                print(f"Error fetching logs from {index}: {e}")
                continue
        
        # Export user data
        export_path = self._export_user_data_to_file(all_user_logs, user_id, start_date, end_date)
        
        # Generate GDPR compliance report
        self._generate_gdpr_report(all_user_logs, user_id, export_path)
        
        return export_path
    
    def export_security_incident_logs(self, incident_id: str, timeframe_hours: int = 24) -> str:
        """Export logs related to a security incident."""
        
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=timeframe_hours)
        
        query = {
            "query": {
                "bool": {
                    "must": [
                        {"range": {"@timestamp": {"gte": start_time.isoformat(), "lte": end_time.isoformat()}}},
                        {
                            "bool": {
                                "should": [
                                    {"term": {"incidentId": incident_id}},
                                    {"match": {"message": incident_id}},
                                    {"term": {"traceId": incident_id}}
                                ]
                            }
                        }
                    ]
                }
            },
            "sort": [{"@timestamp": {"order": "asc"}}]
        }
        
        incident_logs = self._fetch_logs_from_elasticsearch(query, "austa-*")
        export_path = self._export_incident_logs_to_file(incident_logs, incident_id, start_time, end_time)
        
        # Generate security incident report
        self._generate_security_incident_report(incident_logs, incident_id, export_path)
        
        return export_path
    
    def _build_export_query(self, start_date: datetime, end_date: datetime, log_type: str) -> Dict[str, Any]:
        """Build Elasticsearch query for log export."""
        
        base_query = {
            "query": {
                "bool": {
                    "must": [
                        {
                            "range": {
                                "@timestamp": {
                                    "gte": start_date.isoformat(),
                                    "lte": end_date.isoformat()
                                }
                            }
                        }
                    ]
                }
            },
            "sort": [{"@timestamp": {"order": "asc"}}],
            "_source": True
        }
        
        # Add log type specific filters
        if log_type == "security":
            base_query["query"]["bool"]["must"].append(
                {"terms": {"eventType": ["security", "auth", "login"]}}
            )
        elif log_type == "audit":
            base_query["query"]["bool"]["must"].append(
                {"term": {"eventType": "audit"}}
            )
        elif log_type == "error":
            base_query["query"]["bool"]["must"].append(
                {"term": {"level": "ERROR"}}
            )
        
        return base_query
    
    def _fetch_logs_from_elasticsearch(self, query: Dict[str, Any], index_pattern: str) -> List[Dict[str, Any]]:
        """Fetch logs from Elasticsearch with scrolling support."""
        
        all_logs = []
        
        try:
            response = self.es_client.search(
                index=index_pattern,
                body=query,
                size=1000,
                scroll='5m'
            )
            
            all_logs.extend([hit['_source'] for hit in response['hits']['hits']])
            
            # Handle scrolling for large datasets
            scroll_id = response.get('_scroll_id')
            while scroll_id:
                response = self.es_client.scroll(scroll_id=scroll_id, scroll='5m')
                hits = response['hits']['hits']
                if not hits:
                    break
                all_logs.extend([hit['_source'] for hit in hits])
                scroll_id = response.get('_scroll_id')
                
        except Exception as e:
            print(f"Error fetching logs: {e}")
        
        return all_logs
    
    def _export_logs_to_file(
        self, 
        logs: List[Dict[str, Any]], 
        log_type: str, 
        start_date: datetime, 
        end_date: datetime,
        export_format: str
    ) -> str:
        """Export logs to file with optional encryption and compression."""
        
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"austa_{log_type}_logs_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}_{timestamp}"
        
        if export_format == "json":
            filepath = self.export_dir / f"{filename}.json"
            self._export_as_json(logs, filepath)
        elif export_format == "csv":
            filepath = self.export_dir / f"{filename}.csv"
            self._export_as_csv(logs, filepath)
        elif export_format == "sqlite":
            filepath = self.export_dir / f"{filename}.db"
            self._export_as_sqlite(logs, filepath, log_type)
        else:
            raise ValueError(f"Unsupported export format: {export_format}")
        
        # Apply compression if enabled
        if self.config.get("compression_enabled", True):
            filepath = self._compress_file(filepath)
        
        # Apply encryption if enabled
        if self.encryption_key:
            filepath = self._encrypt_file(filepath)
        
        # Generate checksum
        self._generate_checksum(filepath)
        
        # Upload to cloud storage if configured
        if self.config.get("cloud_storage", {}).get("enabled", False):
            self._upload_to_cloud_storage(filepath)
        
        print(f"Exported {len(logs)} logs to {filepath}")
        return str(filepath)
    
    def _export_as_json(self, logs: List[Dict[str, Any]], filepath: Path) -> None:
        """Export logs as JSON."""
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(logs, f, indent=2, default=str, ensure_ascii=False)
    
    def _export_as_csv(self, logs: List[Dict[str, Any]], filepath: Path) -> None:
        """Export logs as CSV."""
        if not logs:
            return
        
        # Get all unique fields
        all_fields = set()
        for log in logs:
            all_fields.update(self._flatten_dict(log).keys())
        
        all_fields = sorted(list(all_fields))
        
        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=all_fields)
            writer.writeheader()
            
            for log in logs:
                flattened = self._flatten_dict(log)
                writer.writerow(flattened)
    
    def _export_as_sqlite(self, logs: List[Dict[str, Any]], filepath: Path, table_name: str) -> None:
        """Export logs as SQLite database."""
        conn = sqlite3.connect(filepath)
        cursor = conn.cursor()
        
        if logs:
            # Get all unique fields
            all_fields = set()
            for log in logs:
                all_fields.update(self._flatten_dict(log).keys())
            
            # Create table
            fields_sql = ", ".join([f'"{field}" TEXT' for field in all_fields])
            cursor.execute(f'CREATE TABLE "{table_name}" ({fields_sql})')
            
            # Insert data
            for log in logs:
                flattened = self._flatten_dict(log)
                placeholders = ", ".join(["?" for _ in all_fields])
                values = [flattened.get(field, "") for field in all_fields]
                cursor.execute(f'INSERT INTO "{table_name}" VALUES ({placeholders})', values)
        
        conn.commit()
        conn.close()
    
    def _flatten_dict(self, d: Dict[str, Any], parent_key: str = '', sep: str = '.') -> Dict[str, Any]:
        """Flatten nested dictionary."""
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten_dict(v, new_key, sep=sep).items())
            elif isinstance(v, list):
                items.append((new_key, json.dumps(v)))
            else:
                items.append((new_key, str(v) if v is not None else ""))
        return dict(items)
    
    def _compress_file(self, filepath: Path) -> Path:
        """Compress file using gzip."""
        compressed_path = filepath.with_suffix(filepath.suffix + '.gz')
        
        with open(filepath, 'rb') as f_in:
            with gzip.open(compressed_path, 'wb') as f_out:
                f_out.writelines(f_in)
        
        # Remove original file
        filepath.unlink()
        return compressed_path
    
    def _encrypt_file(self, filepath: Path) -> Path:
        """Encrypt file using Fernet."""
        encrypted_path = filepath.with_suffix(filepath.suffix + '.enc')
        
        with open(filepath, 'rb') as f_in:
            data = f_in.read()
            encrypted_data = self.encryption_key.encrypt(data)
            
        with open(encrypted_path, 'wb') as f_out:
            f_out.write(encrypted_data)
        
        # Remove original file
        filepath.unlink()
        return encrypted_path
    
    def _generate_checksum(self, filepath: Path) -> None:
        """Generate SHA-256 checksum for file integrity."""
        checksum_path = filepath.with_suffix(filepath.suffix + '.sha256')
        
        sha256_hash = hashlib.sha256()
        with open(filepath, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                sha256_hash.update(chunk)
        
        checksum = sha256_hash.hexdigest()
        
        with open(checksum_path, 'w') as f:
            f.write(f"{checksum}  {filepath.name}\n")
    
    def _upload_to_cloud_storage(self, filepath: Path) -> None:
        """Upload file to configured cloud storage."""
        cloud_config = self.config["cloud_storage"]
        provider = cloud_config["provider"]
        
        if provider == "aws":
            self._upload_to_aws_s3(filepath, cloud_config)
        elif provider == "azure":
            self._upload_to_azure_blob(filepath, cloud_config)
        elif provider == "gcp":
            self._upload_to_gcp_storage(filepath, cloud_config)
    
    def _upload_to_aws_s3(self, filepath: Path, config: Dict[str, Any]) -> None:
        """Upload file to AWS S3."""
        s3_client = boto3.client('s3')
        bucket = config["bucket"]
        key = f"austa-logs/{datetime.utcnow().strftime('%Y/%m/%d')}/{filepath.name}"
        
        s3_client.upload_file(str(filepath), bucket, key)
        print(f"Uploaded {filepath} to s3://{bucket}/{key}")
    
    def _upload_to_azure_blob(self, filepath: Path, config: Dict[str, Any]) -> None:
        """Upload file to Azure Blob Storage."""
        blob_service = BlobServiceClient.from_connection_string(config["connection_string"])
        container = config["container"]
        blob_name = f"austa-logs/{datetime.utcnow().strftime('%Y/%m/%d')}/{filepath.name}"
        
        with open(filepath, 'rb') as data:
            blob_service.get_blob_client(container=container, blob=blob_name).upload_blob(data)
        
        print(f"Uploaded {filepath} to Azure blob storage")
    
    def _generate_compliance_report(self, logs: List[Dict[str, Any]], log_type: str, export_path: str) -> None:
        """Generate compliance report for exported logs."""
        
        report = {
            "export_metadata": {
                "timestamp": datetime.utcnow().isoformat(),
                "log_type": log_type,
                "export_path": export_path,
                "log_count": len(logs),
                "file_size": os.path.getsize(export_path) if os.path.exists(export_path) else 0,
                "compliance_standards": self.config["compliance_standards"]
            },
            "retention_policy": {
                "retention_days": self.config["retention_policies"].get(f"{log_type}_logs", 90),
                "deletion_date": (datetime.utcnow() + timedelta(days=self.config["retention_policies"].get(f"{log_type}_logs", 90))).isoformat()
            },
            "integrity": {
                "checksum_generated": True,
                "encryption_applied": self.encryption_key is not None,
                "compression_applied": self.config.get("compression_enabled", True)
            }
        }
        
        report_path = Path(export_path).with_suffix('.compliance_report.json')
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"Compliance report generated: {report_path}")


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(description="AUSTA Log Export and Compliance Tool")
    parser.add_argument("--config", default="config/compliance-config.json", help="Configuration file path")
    parser.add_argument("--start-date", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--log-types", nargs="+", default=["security", "audit", "application", "error"],
                       help="Log types to export")
    parser.add_argument("--format", choices=["json", "csv", "sqlite"], default="json",
                       help="Export format")
    parser.add_argument("--user-id", help="Export data for specific user (GDPR compliance)")
    parser.add_argument("--incident-id", help="Export logs for security incident")
    
    args = parser.parse_args()
    
    try:
        start_date = datetime.strptime(args.start_date, "%Y-%m-%d")
        end_date = datetime.strptime(args.end_date, "%Y-%m-%d")
    except ValueError:
        print("Error: Invalid date format. Use YYYY-MM-DD")
        sys.exit(1)
    
    exporter = LogExportCompliance(args.config)
    
    if args.user_id:
        # GDPR user data export
        export_path = exporter.export_user_data(args.user_id, start_date, end_date)
        print(f"User data exported to: {export_path}")
    elif args.incident_id:
        # Security incident export
        export_path = exporter.export_security_incident_logs(args.incident_id)
        print(f"Incident logs exported to: {export_path}")
    else:
        # Regular log export
        results = exporter.export_logs_by_date_range(
            start_date, end_date, args.log_types, args.format
        )
        
        for log_type, export_path in results.items():
            print(f"{log_type} logs exported to: {export_path}")


if __name__ == "__main__":
    main()