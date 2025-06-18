import swaggerJSDoc from 'swagger-jsdoc';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'AUSTA Cockpit API',
    version: '1.0.0',
    description: 'Backend API for AUSTA Cockpit - Medical Audit Platform with AI Integration',
    contact: {
      name: 'AUSTA Tech Team',
      email: 'tech@austa.com.br',
      url: 'https://austa.com.br',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: `http://localhost:${process.env.API_PORT || 3000}/api/v1`,
      description: 'Development server',
    },
    {
      url: 'https://api.austa.com.br/v1',
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                example: 'VALIDATION_ERROR',
              },
              message: {
                type: 'string',
                example: 'Validation failed',
              },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                },
              },
            },
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      Success: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          data: {
            type: 'object',
          },
          meta: {
            type: 'object',
            properties: {
              page: {
                type: 'number',
              },
              limit: {
                type: 'number',
              },
              total: {
                type: 'number',
              },
            },
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      Case: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
          },
          patientId: {
            type: 'string',
          },
          procedureCode: {
            type: 'string',
          },
          procedureDescription: {
            type: 'string',
          },
          requestDate: {
            type: 'string',
            format: 'date-time',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
          },
          status: {
            type: 'string',
            enum: ['pending', 'in_review', 'approved', 'denied', 'partial'],
          },
          value: {
            type: 'number',
            format: 'float',
          },
          aiScore: {
            type: 'number',
            format: 'float',
            minimum: 0,
            maximum: 1,
          },
          fraudScore: {
            type: 'number',
            format: 'float',
            minimum: 0,
            maximum: 1,
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      Decision: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
          },
          caseId: {
            type: 'string',
            format: 'uuid',
          },
          auditorId: {
            type: 'string',
            format: 'uuid',
          },
          decision: {
            type: 'string',
            enum: ['approved', 'denied', 'partial'],
          },
          justification: {
            type: 'string',
          },
          aiRecommendation: {
            type: 'string',
            enum: ['approved', 'denied', 'partial', 'review'],
          },
          aiConfidence: {
            type: 'number',
            format: 'float',
            minimum: 0,
            maximum: 1,
          },
          processingTime: {
            type: 'number',
            description: 'Processing time in seconds',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      AIAnalysis: {
        type: 'object',
        properties: {
          recommendation: {
            type: 'string',
            enum: ['approved', 'denied', 'partial', 'review'],
          },
          confidence: {
            type: 'number',
            format: 'float',
            minimum: 0,
            maximum: 1,
          },
          explanation: {
            type: 'string',
          },
          riskFactors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                factor: {
                  type: 'string',
                },
                score: {
                  type: 'number',
                  format: 'float',
                },
                description: {
                  type: 'string',
                },
              },
            },
          },
          similarCases: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                caseId: {
                  type: 'string',
                },
                similarity: {
                  type: 'number',
                  format: 'float',
                },
                decision: {
                  type: 'string',
                },
              },
            },
          },
          medicalContext: {
            type: 'object',
            properties: {
              guidelines: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
              protocols: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
              evidence: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
  tags: [
    {
      name: 'Authentication',
      description: 'Authentication and authorization endpoints',
    },
    {
      name: 'Cases',
      description: 'Medical case management endpoints',
    },
    {
      name: 'Decisions',
      description: 'Audit decision endpoints',
    },
    {
      name: 'AI',
      description: 'AI analysis and chat endpoints',
    },
    {
      name: 'Analytics',
      description: 'Analytics and reporting endpoints',
    },
    {
      name: 'Notifications',
      description: 'Notification management endpoints',
    },
    {
      name: 'Audit',
      description: 'Audit trail and compliance endpoints',
    },
    {
      name: 'Health',
      description: 'Health check and monitoring endpoints',
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  apis: ['./src/routes/*.ts', './src/routes/*.js'],
};

export const swaggerSpec = swaggerJSDoc(options);