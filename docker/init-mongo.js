// MongoDB initialization script for AUSTA Cockpit

// Switch to admin database
use admin;

// Create application user
db.createUser({
  user: "austa_app",
  pwd: "austa_app_password",
  roles: [
    { role: "readWrite", db: "austa_logs" },
    { role: "readWrite", db: "austa_ai_logs" },
    { role: "dbAdmin", db: "austa_logs" },
    { role: "dbAdmin", db: "austa_ai_logs" }
  ]
});

// Switch to main logs database
use austa_logs;

// Create collections with validation
db.createCollection("application_logs", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["timestamp", "level", "message"],
      properties: {
        timestamp: {
          bsonType: "date",
          description: "Log timestamp"
        },
        level: {
          enum: ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
          description: "Log level"
        },
        message: {
          bsonType: "string",
          description: "Log message"
        },
        service: {
          bsonType: "string",
          description: "Service name"
        },
        metadata: {
          bsonType: "object",
          description: "Additional metadata"
        }
      }
    }
  }
});

db.createCollection("audit_logs", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["timestamp", "user_id", "action"],
      properties: {
        timestamp: {
          bsonType: "date",
          description: "Audit timestamp"
        },
        user_id: {
          bsonType: "string",
          description: "User ID"
        },
        action: {
          bsonType: "string",
          description: "Action performed"
        },
        resource: {
          bsonType: "string",
          description: "Resource affected"
        },
        details: {
          bsonType: "object",
          description: "Action details"
        }
      }
    }
  }
});

db.createCollection("performance_metrics", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["timestamp", "metric_type", "value"],
      properties: {
        timestamp: {
          bsonType: "date",
          description: "Metric timestamp"
        },
        metric_type: {
          bsonType: "string",
          description: "Type of metric"
        },
        value: {
          bsonType: ["number", "object"],
          description: "Metric value"
        },
        tags: {
          bsonType: "object",
          description: "Metric tags"
        }
      }
    }
  }
});

// Create indexes for logs database
db.application_logs.createIndex({ timestamp: -1 });
db.application_logs.createIndex({ level: 1, timestamp: -1 });
db.application_logs.createIndex({ service: 1, timestamp: -1 });

db.audit_logs.createIndex({ timestamp: -1 });
db.audit_logs.createIndex({ user_id: 1, timestamp: -1 });
db.audit_logs.createIndex({ action: 1, timestamp: -1 });

db.performance_metrics.createIndex({ timestamp: -1 });
db.performance_metrics.createIndex({ metric_type: 1, timestamp: -1 });

// Create TTL indexes for automatic log rotation (30 days)
db.application_logs.createIndex({ timestamp: 1 }, { expireAfterSeconds: 2592000 });
db.performance_metrics.createIndex({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

// Audit logs kept for 90 days
db.audit_logs.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

// Switch to AI logs database
use austa_ai_logs;

// Create AI-specific collections
db.createCollection("ai_requests", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["timestamp", "model", "request", "response"],
      properties: {
        timestamp: {
          bsonType: "date",
          description: "Request timestamp"
        },
        model: {
          bsonType: "string",
          description: "AI model used"
        },
        request: {
          bsonType: "object",
          description: "Request details"
        },
        response: {
          bsonType: "object",
          description: "Response details"
        },
        latency_ms: {
          bsonType: "number",
          description: "Response latency in milliseconds"
        },
        tokens_used: {
          bsonType: "object",
          description: "Token usage details"
        }
      }
    }
  }
});

db.createCollection("ai_analytics", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["timestamp", "metric", "value"],
      properties: {
        timestamp: {
          bsonType: "date",
          description: "Metric timestamp"
        },
        metric: {
          bsonType: "string",
          description: "Metric name"
        },
        value: {
          bsonType: ["number", "object"],
          description: "Metric value"
        },
        model: {
          bsonType: "string",
          description: "AI model"
        }
      }
    }
  }
});

// Create indexes for AI logs
db.ai_requests.createIndex({ timestamp: -1 });
db.ai_requests.createIndex({ model: 1, timestamp: -1 });
db.ai_requests.createIndex({ "tokens_used.total": -1 });

db.ai_analytics.createIndex({ timestamp: -1 });
db.ai_analytics.createIndex({ metric: 1, timestamp: -1 });
db.ai_analytics.createIndex({ model: 1, metric: 1, timestamp: -1 });

// TTL indexes for AI logs (60 days)
db.ai_requests.createIndex({ timestamp: 1 }, { expireAfterSeconds: 5184000 });
db.ai_analytics.createIndex({ timestamp: 1 }, { expireAfterSeconds: 5184000 });

print("MongoDB initialization completed successfully");