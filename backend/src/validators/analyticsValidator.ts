import Joi from 'joi';

export const analyticsQuerySchema = Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
  metrics: Joi.array().items(Joi.string().valid(
    'cases',
    'performance',
    'fraud',
    'ai',
    'timeSeries',
    'kpis'
  )).optional(),
  groupBy: Joi.string().valid('hour', 'day', 'week', 'month').optional(),
  auditors: Joi.array().items(Joi.string()).optional(),
  caseTypes: Joi.array().items(Joi.string()).optional(),
  priority: Joi.string().valid('high', 'medium', 'low').optional(),
  fraudRiskLevel: Joi.string().valid('high', 'medium', 'low').optional()
});

export const validateAnalyticsQuery = (query: any) => {
  return analyticsQuerySchema.validate(query);
};

export const exportQuerySchema = Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
  format: Joi.string().valid('csv', 'json', 'pdf', 'excel').optional().default('json'),
  metrics: Joi.array().items(Joi.string()).optional(),
  includeCharts: Joi.boolean().optional().default(true)
});

export const validateExportQuery = (query: any) => {
  return exportQuerySchema.validate(query);
};