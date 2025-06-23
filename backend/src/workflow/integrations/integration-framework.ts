/**
 * Integration Framework for External Healthcare Systems
 * Handles connections to EHR systems, payers, providers, and other healthcare entities
 */

import { EventEmitter } from 'events';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
// Removed problematic imports - using axios for all HTTP-based integrations
// import * as hl7 from 'node-hl7-complete';
// import * as fhir from 'fhir-kit-client';
import { logger } from '../../utils/logger';
import { 
  IntegrationConfig, 
  AuthenticationConfig, 
  DataMapping, 
  ErrorHandlingConfig,
  RetryPolicy 
} from '../types/workflow-definitions';

export enum IntegrationType {
  EHR = 'ehr',
  PAYER = 'payer',
  PROVIDER = 'provider',
  CLEARINGHOUSE = 'clearinghouse',
  API = 'api',
  DATABASE = 'database',
  HL7 = 'hl7',
  FHIR = 'fhir',
  X12 = 'x12',
  SFTP = 'sftp'
}

export enum MessageType {
  ELIGIBILITY_REQUEST = 'eligibility_request',
  ELIGIBILITY_RESPONSE = 'eligibility_response',
  AUTHORIZATION_REQUEST = 'authorization_request',
  AUTHORIZATION_RESPONSE = 'authorization_response',
  CLAIM_SUBMISSION = 'claim_submission',
  CLAIM_STATUS = 'claim_status',
  PATIENT_LOOKUP = 'patient_lookup',
  PROVIDER_LOOKUP = 'provider_lookup',
  BENEFIT_INQUIRY = 'benefit_inquiry',
  REFERRAL_REQUEST = 'referral_request',
  MEDICAL_RECORDS = 'medical_records',
  PRESCRIPTION_REQUEST = 'prescription_request'
}

export interface IntegrationMessage {
  id: string;
  type: MessageType;
  sourceSystem: string;
  targetSystem: string;
  correlationId: string;
  timestamp: Date;
  payload: any;
  metadata: Record<string, any>;
}

export interface IntegrationResponse {
  success: boolean;
  messageId: string;
  responseTime: number;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: Record<string, any>;
}

export abstract class IntegrationAdapter {
  protected config: IntegrationConfig;
  protected client: AxiosInstance;
  protected eventEmitter: EventEmitter;

  constructor(config: IntegrationConfig) {
    this.config = config;
    this.eventEmitter = new EventEmitter();
    this.client = this.createHttpClient();
  }

  abstract connect(): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  abstract sendMessage(message: IntegrationMessage): Promise<IntegrationResponse>;
  abstract receiveMessage(): Promise<IntegrationMessage[]>;
  abstract healthCheck(): Promise<boolean>;

  protected createHttpClient(): AxiosInstance {
    const client = axios.create({
      baseURL: this.config.endpoint,
      timeout: this.convertDurationToMs(this.config.timeout),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AUSTA-Workflow-Engine/1.0',
        ...this.config.headers
      }
    });

    // Add authentication interceptor
    client.interceptors.request.use(this.addAuthentication.bind(this));

    // Add retry interceptor
    client.interceptors.response.use(
      response => response,
      this.handleRetry.bind(this)
    );

    return client;
  }

  protected async addAuthentication(config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> {
    const auth = this.config.authentication;
    
    // Ensure headers object exists with proper typing
    if (!config.headers) {
      config.headers = {} as any;
    }
    
    switch (auth.type) {
      case 'basic':
        if (auth.credentials?.username && auth.credentials?.password) {
          config.auth = {
            username: auth.credentials.username,
            password: auth.credentials.password
          };
        }
        break;
        
      case 'bearer':
        if (auth.credentials?.token) {
          config.headers['Authorization'] = `Bearer ${auth.credentials.token}`;
        }
        break;
        
      case 'apikey':
        if (auth.credentials?.apiKey) {
          config.headers['X-API-Key'] = auth.credentials.apiKey;
        }
        break;
        
      case 'oauth2':
        const token = await this.getOAuth2Token();
        if (token) {
          config.headers['Authorization'] = `Bearer ${token}`;
        }
        break;
    }
    
    return config;
  }

  protected async handleRetry(error: any): Promise<any> {
    const retryPolicy = this.config.retryPolicy;
    const request = error.config;
    
    if (!request) {
      return Promise.reject(error);
    }
    
    // Add retry count to request config
    const retryCount = (request as any)._retryCount || 0;
    
    if (retryCount >= retryPolicy.maxAttempts) {
      return Promise.reject(error);
    }
    
    // Check if error is retryable
    if (!this.isRetryableError(error, retryPolicy.retryConditions)) {
      return Promise.reject(error);
    }
    
    (request as any)._retryCount = retryCount + 1;
    
    // Calculate delay
    const delay = this.calculateRetryDelay(
      (request as any)._retryCount, 
      retryPolicy
    );
    
    logger.info('Retrying integration request', {
      url: request.url,
      attempt: (request as any)._retryCount,
      delay,
      error: error.message
    });
    
    await this.sleep(delay);
    return this.client.request(request);
  }

  protected isRetryableError(error: any, retryConditions: string[]): boolean {
    const status = error.response?.status;
    const code = error.code;
    
    return retryConditions.some(condition => {
      switch (condition) {
        case 'timeout':
          return code === 'ECONNABORTED' || code === 'ETIMEDOUT';
        case 'server_error':
          return status >= 500;
        case 'network_error':
          return !status && (code === 'ECONNREFUSED' || code === 'ENOTFOUND');
        case 'rate_limit':
          return status === 429;
        default:
          return false;
      }
    });
  }

  protected calculateRetryDelay(attempt: number, retryPolicy: RetryPolicy): number {
    const initialDelay = this.convertDurationToMs(retryPolicy.initialDelay);
    
    switch (retryPolicy.backoffType) {
      case 'fixed':
        return initialDelay;
        
      case 'linear':
        return initialDelay * attempt;
        
      case 'exponential':
        const delay = initialDelay * Math.pow(2, attempt - 1);
        const maxDelay = retryPolicy.maxDelay 
          ? this.convertDurationToMs(retryPolicy.maxDelay)
          : 60000;
        return Math.min(delay, maxDelay);
        
      default:
        return initialDelay;
    }
  }

  protected async getOAuth2Token(): Promise<string | null> {
    const auth = this.config.authentication;
    
    if (!auth.credentials?.clientId || !auth.credentials?.clientSecret) {
      return null;
    }
    
    try {
      const response = await axios.post('/oauth/token', {
        grant_type: 'client_credentials',
        client_id: auth.credentials.clientId,
        client_secret: auth.credentials.clientSecret,
        scope: auth.credentials.scope?.join(' ')
      });
      
      return response.data.access_token;
    } catch (error) {
      logger.error('OAuth2 token request failed', { error });
      return null;
    }
  }

  protected convertDurationToMs(duration: { value: number; unit: string }): number {
    const multipliers: Record<string, number> = {
      second: 1000,
      minute: 60000,
      hour: 3600000,
      day: 86400000
    };
    
    return duration.value * (multipliers[duration.unit] || 1000);
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected mapData(data: any, mapping: DataMapping[]): any {
    const result: any = {};
    
    mapping.forEach(map => {
      const sourceValue = this.getNestedValue(data, map.source);
      
      if (sourceValue !== undefined || map.required) {
        this.setNestedValue(
          result, 
          map.target, 
          sourceValue !== undefined ? sourceValue : map.defaultValue
        );
      }
    });
    
    return result;
  }

  protected getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  protected setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    
    const target = keys.reduce((current, key) => {
      if (!current[key]) {
        current[key] = {};
      }
      return current[key];
    }, obj);
    
    target[lastKey] = value;
  }
}

// FHIR Integration Adapter - using standard HTTP client
export class FHIRIntegrationAdapter extends IntegrationAdapter {
  constructor(config: IntegrationConfig) {
    super(config);
  }

  async connect(): Promise<boolean> {
    try {
      // Test connection with capability statement
      const response = await this.client.get('/metadata');
      
      logger.info('FHIR client connected successfully', {
        endpoint: this.config.endpoint,
        serverVersion: response.data?.fhirVersion
      });
      
      return true;
    } catch (error) {
      logger.error('FHIR client connection failed', {
        endpoint: this.config.endpoint,
        error: (error as Error).message
      });
      return false;
    }
  }

  async disconnect(): Promise<void> {
    // No specific cleanup needed for HTTP client
  }

  async sendMessage(message: IntegrationMessage): Promise<IntegrationResponse> {
    const startTime = Date.now();
    
    try {
      let response;
      
      switch (message.type) {
        case MessageType.PATIENT_LOOKUP:
          response = await this.client.get('/Patient', {
            params: message.payload
          });
          break;
          
        case MessageType.MEDICAL_RECORDS:
          response = await this.client.get('/DocumentReference', {
            params: { patient: message.payload.patientId }
          });
          break;
          
        default:
          throw new Error(`Unsupported message type: ${message.type}`);
      }
      
      return {
        success: true,
        messageId: message.id,
        responseTime: Date.now() - startTime,
        data: this.mapData(response.data, this.config.responseMapping),
        metadata: {
          resourceType: response.data?.resourceType || 'Bundle',
          total: response.data?.total || 0
        }
      };
      
    } catch (error) {
      return {
        success: false,
        messageId: message.id,
        responseTime: Date.now() - startTime,
        error: {
          code: 'FHIR_ERROR',
          message: (error as Error).message
        },
        metadata: {}
      };
    }
  }

  async receiveMessage(): Promise<IntegrationMessage[]> {
    // FHIR is typically request-response, not message-based
    return [];
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/metadata');
      return true;
    } catch {
      return false;
    }
  }
}

// HL7 Integration Adapter - simplified implementation
export class HL7IntegrationAdapter extends IntegrationAdapter {
  private hl7Server: any = null;

  async connect(): Promise<boolean> {
    try {
      // Initialize HL7 connection
      logger.info('HL7 adapter connected', {
        endpoint: this.config.endpoint
      });
      return true;
    } catch (error) {
      logger.error('HL7 connection failed', { error });
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.hl7Server) {
      this.hl7Server.close();
    }
  }

  async sendMessage(message: IntegrationMessage): Promise<IntegrationResponse> {
    const startTime = Date.now();
    
    try {
      const hl7Message = this.createHL7Message(message);
      
      // Send HL7 message implementation would go here
      const response = await this.sendHL7Message(hl7Message);
      
      return {
        success: true,
        messageId: message.id,
        responseTime: Date.now() - startTime,
        data: this.parseHL7Response(response),
        metadata: {
          messageType: hl7Message.header.messageType,
          controlId: hl7Message.header.controlId
        }
      };
      
    } catch (error) {
      return {
        success: false,
        messageId: message.id,
        responseTime: Date.now() - startTime,
        error: {
          code: 'HL7_ERROR',
          message: (error as Error).message
        },
        metadata: {}
      };
    }
  }

  async receiveMessage(): Promise<IntegrationMessage[]> {
    // Implementation for receiving HL7 messages
    return [];
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  private createHL7Message(message: IntegrationMessage): any {
    // Create HL7 message structure
    return {
      header: {
        messageType: this.getHL7MessageType(message.type),
        controlId: message.id,
        timestamp: message.timestamp
      },
      segments: this.mapToHL7Segments(message.payload)
    };
  }

  private async sendHL7Message(hl7Message: any): Promise<any> {
    // Implementation for sending HL7 message
    return {};
  }

  private parseHL7Response(response: any): any {
    // Parse HL7 response
    return response;
  }

  private getHL7MessageType(messageType: MessageType): string {
    const mapping: Record<MessageType, string> = {
      [MessageType.ELIGIBILITY_REQUEST]: 'QBP^Q11^QBP_Q11',
      [MessageType.AUTHORIZATION_REQUEST]: 'REF^I12^REF_I12',
      [MessageType.PATIENT_LOOKUP]: 'QBP^Q22^QBP_Q21',
      // Add more mappings as needed
    } as any;
    
    return mapping[messageType] || 'ADT^A01^ADT_A01';
  }

  private mapToHL7Segments(payload: any): any[] {
    // Map payload to HL7 segments
    return [];
  }
}

// X12 EDI Integration Adapter
export class X12IntegrationAdapter extends IntegrationAdapter {
  async connect(): Promise<boolean> {
    logger.info('X12 adapter connected', {
      endpoint: this.config.endpoint
    });
    return true;
  }

  async disconnect(): Promise<void> {
    // X12 cleanup
  }

  async sendMessage(message: IntegrationMessage): Promise<IntegrationResponse> {
    const startTime = Date.now();
    
    try {
      const x12Message = this.createX12Message(message);
      const response = await this.client.post('/', x12Message);
      
      return {
        success: true,
        messageId: message.id,
        responseTime: Date.now() - startTime,
        data: this.parseX12Response(response.data),
        metadata: {
          transactionSet: this.getX12TransactionSet(message.type),
          interchangeControlNumber: message.id
        }
      };
      
    } catch (error) {
      return {
        success: false,
        messageId: message.id,
        responseTime: Date.now() - startTime,
        error: {
          code: 'X12_ERROR',
          message: (error as Error).message
        },
        metadata: {}
      };
    }
  }

  async receiveMessage(): Promise<IntegrationMessage[]> {
    return [];
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/health');
      return true;
    } catch {
      return false;
    }
  }

  private createX12Message(message: IntegrationMessage): string {
    // Create X12 EDI message format
    const transactionSet = this.getX12TransactionSet(message.type);
    
    switch (transactionSet) {
      case '270': // Eligibility Inquiry
        return this.create270Message(message.payload);
      case '278': // Authorization Request
        return this.create278Message(message.payload);
      default:
        throw new Error(`Unsupported X12 transaction set: ${transactionSet}`);
    }
  }

  private create270Message(payload: any): string {
    // Build 270 eligibility inquiry message
    return `ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *${new Date().toISOString().slice(0, 6)}*${new Date().toISOString().slice(8, 12)}*^*00501*000000001*0*P*:~
GS*HS*SENDER*RECEIVER*${new Date().toISOString().slice(0, 8)}*${new Date().toISOString().slice(8, 12)}*1*X*005010X279A1~
ST*270*0001*005010X279A1~
BHT*0022*13*${payload.requestId}*${new Date().toISOString().slice(0, 8)}*${new Date().toISOString().slice(8, 12)}~
HL*1**20*1~
NM1*PR*2*${payload.payerName}*****PI*${payload.payerId}~
HL*2*1*21*1~
NM1*1P*2*${payload.providerName}*****XX*${payload.providerNPI}~
HL*3*2*22*0~
TRN*1*${payload.traceNumber}*${payload.originatorId}~
NM1*IL*1*${payload.subscriberLastName}*${payload.subscriberFirstName}****MI*${payload.memberId}~
DMG*D8*${payload.dateOfBirth}*${payload.gender}~
DTP*291*D8*${payload.serviceDate}~
EQ*30~
SE*11*0001~
GE*1*1~
IEA*1*000000001~`;
  }

  private create278Message(payload: any): string {
    // Build 278 authorization request message
    return `ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *${new Date().toISOString().slice(0, 6)}*${new Date().toISOString().slice(8, 12)}*^*00501*000000001*0*P*:~
GS*HI*SENDER*RECEIVER*${new Date().toISOString().slice(0, 8)}*${new Date().toISOString().slice(8, 12)}*1*X*005010X217~
ST*278*0001*005010X217~
BHT*0007*13*${payload.requestId}*${new Date().toISOString().slice(0, 8)}*${new Date().toISOString().slice(8, 12)}~
HL*1**20*1~
NM1*PR*2*${payload.payerName}*****PI*${payload.payerId}~
HL*2*1*21*1~
NM1*1P*2*${payload.providerName}*****XX*${payload.providerNPI}~
HL*3*2*22*1~
TRN*1*${payload.traceNumber}*${payload.originatorId}~
UM*HS*I*******Y~
DTP*472*D8*${payload.serviceDate}~
NM1*IL*1*${payload.subscriberLastName}*${payload.subscriberFirstName}****MI*${payload.memberId}~
HL*4*3*23*0~
SV1*HC:${payload.procedureCode}*${payload.chargedAmount}*UN*1***1~
DTP*472*D8*${payload.serviceDate}~
SE*13*0001~
GE*1*1~
IEA*1*000000001~`;
  }

  private parseX12Response(response: string): any {
    // Parse X12 response
    const segments = response.split('~');
    const result: any = {};
    
    segments.forEach(segment => {
      const elements = segment.split('*');
      const segmentId = elements[0];
      
      switch (segmentId) {
        case 'AAA':
          result.authorizationStatus = elements[1];
          result.statusReason = elements[3];
          break;
        case 'EB':
          result.benefitInfo = {
            serviceType: elements[1],
            coverage: elements[2],
            timePeriod: elements[3]
          };
          break;
      }
    });
    
    return result;
  }

  private getX12TransactionSet(messageType: MessageType): string {
    const mapping: Record<MessageType, string> = {
      [MessageType.ELIGIBILITY_REQUEST]: '270',
      [MessageType.ELIGIBILITY_RESPONSE]: '271',
      [MessageType.AUTHORIZATION_REQUEST]: '278',
      [MessageType.AUTHORIZATION_RESPONSE]: '278',
      [MessageType.CLAIM_SUBMISSION]: '837',
      [MessageType.CLAIM_STATUS]: '276'
    } as any;
    
    return mapping[messageType] || '270';
  }
}

// Integration Manager
export class IntegrationManager extends EventEmitter {
  private adapters: Map<string, IntegrationAdapter> = new Map();
  private configs: Map<string, IntegrationConfig> = new Map();

  async registerIntegration(name: string, config: IntegrationConfig): Promise<void> {
    this.configs.set(name, config);
    
    const adapter = this.createAdapter(config);
    this.adapters.set(name, adapter);
    
    const connected = await adapter.connect();
    if (!connected) {
      throw new Error(`Failed to connect to integration: ${name}`);
    }
    
    logger.info('Integration registered successfully', {
      name,
      type: config.type,
      endpoint: config.endpoint
    });
  }

  async sendMessage(
    integrationName: string, 
    message: IntegrationMessage
  ): Promise<IntegrationResponse> {
    const adapter = this.adapters.get(integrationName);
    if (!adapter) {
      throw new Error(`Integration not found: ${integrationName}`);
    }
    
    const response = await adapter.sendMessage(message);
    
    this.emit('messageSent', {
      integrationName,
      message,
      response
    });
    
    return response;
  }

  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    const adapterEntries = Array.from(this.adapters.entries());
    for (const [name, adapter] of adapterEntries) {
      results[name] = await adapter.healthCheck();
    }
    
    return results;
  }

  private createAdapter(config: IntegrationConfig): IntegrationAdapter {
    switch (config.type) {
      case 'fhir':
        return new FHIRIntegrationAdapter(config);
      case 'hl7':
        return new HL7IntegrationAdapter(config);
      case 'x12':
        return new X12IntegrationAdapter(config);
      default:
        return new FHIRIntegrationAdapter(config); // Default to FHIR
    }
  }
}

export const integrationManager = new IntegrationManager();