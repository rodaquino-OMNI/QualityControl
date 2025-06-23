/**
 * Healthcare Push Notification Service
 * Manages push notifications for urgent case alerts, emergency notifications,
 * and critical healthcare updates with proper healthcare-specific handling
 */

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
  vibrate?: number[];
  data?: {
    caseId?: string;
    patientId?: string;
    priority: 'low' | 'medium' | 'high' | 'critical' | 'emergency';
    type: 'case_alert' | 'emergency' | 'system' | 'reminder' | 'update';
    timestamp: number;
    actionUrl?: string;
    actions?: NotificationAction[];
  };
}

interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userId: string;
  deviceType: 'mobile' | 'desktop' | 'tablet';
  emergencyNotifications: boolean;
  caseAlerts: boolean;
  systemNotifications: boolean;
  reminderNotifications: boolean;
}

interface NotificationPreferences {
  enabled: boolean;
  emergencyAlerts: boolean;
  caseUpdates: boolean;
  systemMessages: boolean;
  reminders: boolean;
  quietHours: {
    enabled: boolean;
    startTime: string; // HH:MM format
    endTime: string;   // HH:MM format
  };
  weekendNotifications: boolean;
  vibrationEnabled: boolean;
  soundEnabled: boolean;
}

class PushNotificationService {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private subscription: PushSubscription | null = null;
  private preferences: NotificationPreferences;
  private vapidPublicKey: string = 'YOUR_VAPID_PUBLIC_KEY'; // Replace with actual VAPID key
  
  // Healthcare-specific notification templates
  private readonly notificationTemplates = {
    emergency: {
      icon: '/frontend/public/icons/emergency-icon.png',
      badge: '/frontend/public/icons/emergency-badge.png',
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
      tag: 'emergency'
    },
    critical_case: {
      icon: '/frontend/public/icons/critical-case-icon.png',
      badge: '/frontend/public/icons/critical-badge.png',
      requireInteraction: true,
      vibrate: [300, 200, 300],
      tag: 'critical-case'
    },
    high_priority: {
      icon: '/frontend/public/icons/high-priority-icon.png',
      badge: '/frontend/public/icons/high-badge.png',
      requireInteraction: false,
      vibrate: [200, 100, 200],
      tag: 'high-priority'
    },
    standard: {
      icon: '/frontend/public/icons/icon-192x192.png',
      badge: '/frontend/public/icons/badge-72x72.png',
      requireInteraction: false,
      vibrate: [100],
      tag: 'standard'
    }
  };

  constructor() {
    this.preferences = this.loadPreferences();
    this.initializeService();
  }

  /**
   * Initialize the push notification service
   */
  private async initializeService(): Promise<void> {
    try {
      // Check if service workers and push messaging are supported
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push notifications not supported in this browser');
        return;
      }

      // Wait for service worker to be ready
      this.swRegistration = await navigator.serviceWorker.ready;
      
      // Check current subscription
      this.subscription = await this.swRegistration.pushManager.getSubscription();
      
      console.log('PushNotificationService: Initialized', {
        hasSubscription: !!this.subscription,
        preferences: this.preferences
      });

    } catch (error) {
      console.error('PushNotificationService: Initialization failed:', error);
    }
  }

  /**
   * Request permission and subscribe to push notifications
   */
  async requestPermissionAndSubscribe(): Promise<boolean> {
    try {
      // Check if notifications are supported
      if (!('Notification' in window)) {
        throw new Error('This browser does not support notifications');
      }

      // Request permission
      const permission = await Notification.requestPermission();
      
      if (permission !== 'granted') {
        console.log('PushNotificationService: Permission denied');
        return false;
      }

      // Subscribe to push notifications
      const subscribed = await this.subscribeToPushNotifications();
      
      if (subscribed) {
        // Track successful subscription
        this.trackNotificationEvent('permission_granted', {
          deviceType: this.getDeviceType(),
          timestamp: Date.now()
        });
      }

      return subscribed;

    } catch (error) {
      console.error('PushNotificationService: Permission request failed:', error);
      return false;
    }
  }

  /**
   * Subscribe to push notifications
   */
  private async subscribeToPushNotifications(): Promise<boolean> {
    try {
      if (!this.swRegistration) {
        throw new Error('Service worker not available');
      }

      // Convert VAPID key
      const applicationServerKey = this.urlBase64ToUint8Array(this.vapidPublicKey);

      // Subscribe
      this.subscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });

      // Send subscription to server
      await this.sendSubscriptionToServer(this.subscription);
      
      console.log('PushNotificationService: Successfully subscribed');
      return true;

    } catch (error) {
      console.error('PushNotificationService: Subscription failed:', error);
      return false;
    }
  }

  /**
   * Send subscription data to server
   */
  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
    const subscriptionData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
        auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!)))
      },
      userId: this.getCurrentUserId(),
      deviceType: this.getDeviceType(),
      emergencyNotifications: this.preferences.emergencyAlerts,
      caseAlerts: this.preferences.caseUpdates,
      systemNotifications: this.preferences.systemMessages,
      reminderNotifications: this.preferences.reminders
    };

    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getAuthToken()}`
      },
      body: JSON.stringify(subscriptionData)
    });

    if (!response.ok) {
      throw new Error(`Failed to send subscription to server: ${response.statusText}`);
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe(): Promise<boolean> {
    try {
      if (!this.subscription) {
        return true; // Already unsubscribed
      }

      // Unsubscribe from browser
      const unsubscribed = await this.subscription.unsubscribe();
      
      if (unsubscribed) {
        // Notify server
        await this.removeSubscriptionFromServer();
        this.subscription = null;
        
        console.log('PushNotificationService: Successfully unsubscribed');
      }

      return unsubscribed;

    } catch (error) {
      console.error('PushNotificationService: Unsubscribe failed:', error);
      return false;
    }
  }

  /**
   * Remove subscription from server
   */
  private async removeSubscriptionFromServer(): Promise<void> {
    try {
      const response = await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          userId: this.getCurrentUserId(),
          endpoint: this.subscription?.endpoint
        })
      });

      if (!response.ok) {
        console.warn('Failed to remove subscription from server');
      }
    } catch (error) {
      console.error('Error removing subscription from server:', error);
    }
  }

  /**
   * Show local notification (for testing or immediate alerts)
   */
  async showLocalNotification(payload: NotificationPayload): Promise<void> {
    try {
      // Check if notifications are permitted
      if (Notification.permission !== 'granted') {
        console.warn('Cannot show notification: permission not granted');
        return;
      }

      // Check quiet hours
      if (this.isInQuietHours()) {
        console.log('Notification suppressed: quiet hours active');
        return;
      }

      // Get notification template based on priority
      const template = this.getNotificationTemplate(payload.data?.priority || 'low');
      
      // Merge payload with template
      const notificationOptions: NotificationOptions = {
        body: payload.body,
        icon: payload.icon || template.icon,
        badge: payload.badge || template.badge,
        tag: payload.tag || template.tag,
        requireInteraction: payload.requireInteraction ?? template.requireInteraction,
        silent: payload.silent || false,
        data: payload.data,
        vibrate: this.preferences.vibrationEnabled ? (payload.vibrate || template.vibrate) : undefined
      };
      
      // Add actions if supported
      const actions = payload.data?.actions || this.getDefaultActions(payload.data?.type);
      if (actions && 'actions' in notificationOptions) {
        (notificationOptions as any).actions = actions;
      }

      // Show notification via service worker
      if (this.swRegistration) {
        await this.swRegistration.showNotification(payload.title, notificationOptions);
      } else {
        // Fallback to direct notification
        new Notification(payload.title, notificationOptions);
      }

      // Track notification shown
      this.trackNotificationEvent('notification_shown', {
        type: payload.data?.type,
        priority: payload.data?.priority,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('PushNotificationService: Failed to show notification:', error);
    }
  }

  /**
   * Send emergency alert (highest priority)
   */
  async sendEmergencyAlert(title: string, body: string, data?: any): Promise<void> {
    const payload: NotificationPayload = {
      title: `🚨 EMERGENCY: ${title}`,
      body,
      data: {
        priority: 'emergency',
        type: 'emergency',
        timestamp: Date.now(),
        ...data
      },
      requireInteraction: true
    };

    await this.showLocalNotification(payload);
  }

  /**
   * Send critical case alert
   */
  async sendCriticalCaseAlert(caseId: string, patientName: string, description: string): Promise<void> {
    const payload: NotificationPayload = {
      title: `Critical Case Alert`,
      body: `Patient: ${patientName} - ${description}`,
      data: {
        caseId,
        priority: 'critical',
        type: 'case_alert',
        timestamp: Date.now(),
        actionUrl: `/cases/${caseId}`,
        actions: [
          { action: 'view', title: 'View Case', icon: '/icons/view.png' },
          { action: 'approve', title: 'Quick Approve', icon: '/icons/approve.png' }
        ]
      }
    };

    await this.showLocalNotification(payload);
  }

  /**
   * Send case update notification
   */
  async sendCaseUpdate(caseId: string, update: string, priority: 'low' | 'medium' | 'high' = 'medium'): Promise<void> {
    const payload: NotificationPayload = {
      title: 'Case Update',
      body: update,
      data: {
        caseId,
        priority,
        type: 'case_alert',
        timestamp: Date.now(),
        actionUrl: `/cases/${caseId}`
      }
    };

    await this.showLocalNotification(payload);
  }

  /**
   * Send reminder notification
   */
  async sendReminder(title: string, body: string, actionUrl?: string): Promise<void> {
    if (!this.preferences.reminders) {
      return; // Reminders disabled
    }

    const payload: NotificationPayload = {
      title: `Reminder: ${title}`,
      body,
      data: {
        priority: 'medium',
        type: 'reminder',
        timestamp: Date.now(),
        actionUrl
      }
    };

    await this.showLocalNotification(payload);
  }

  /**
   * Update notification preferences
   */
  updatePreferences(newPreferences: Partial<NotificationPreferences>): void {
    this.preferences = { ...this.preferences, ...newPreferences };
    this.savePreferences();
    
    // Update server subscription if needed
    if (this.subscription) {
      this.sendSubscriptionToServer(this.subscription);
    }
  }

  /**
   * Get current notification preferences
   */
  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  /**
   * Check if currently in quiet hours
   */
  private isInQuietHours(): boolean {
    if (!this.preferences.quietHours.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const { startTime, endTime } = this.preferences.quietHours;
    
    // Handle overnight quiet hours (e.g., 22:00 to 06:00)
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime <= endTime;
    } else {
      return currentTime >= startTime && currentTime <= endTime;
    }
  }

  /**
   * Get notification template based on priority
   */
  private getNotificationTemplate(priority: string) {
    switch (priority) {
      case 'emergency':
        return this.notificationTemplates.emergency;
      case 'critical':
        return this.notificationTemplates.critical_case;
      case 'high':
        return this.notificationTemplates.high_priority;
      default:
        return this.notificationTemplates.standard;
    }
  }

  /**
   * Get default actions based on notification type
   */
  private getDefaultActions(type?: string): NotificationAction[] {
    switch (type) {
      case 'case_alert':
        return [
          { action: 'view', title: 'View Case' },
          { action: 'dismiss', title: 'Dismiss' }
        ];
      case 'emergency':
        return [
          { action: 'acknowledge', title: 'Acknowledge' },
          { action: 'escalate', title: 'Escalate' }
        ];
      default:
        return [
          { action: 'view', title: 'View' },
          { action: 'dismiss', title: 'Dismiss' }
        ];
    }
  }

  /**
   * Load preferences from storage
   */
  private loadPreferences(): NotificationPreferences {
    const defaultPreferences: NotificationPreferences = {
      enabled: true,
      emergencyAlerts: true,
      caseUpdates: true,
      systemMessages: true,
      reminders: true,
      quietHours: {
        enabled: false,
        startTime: '22:00',
        endTime: '07:00'
      },
      weekendNotifications: true,
      vibrationEnabled: true,
      soundEnabled: true
    };

    try {
      const stored = localStorage.getItem('notification-preferences');
      return stored ? { ...defaultPreferences, ...JSON.parse(stored) } : defaultPreferences;
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
      return defaultPreferences;
    }
  }

  /**
   * Save preferences to storage
   */
  private savePreferences(): void {
    try {
      localStorage.setItem('notification-preferences', JSON.stringify(this.preferences));
    } catch (error) {
      console.error('Failed to save notification preferences:', error);
    }
  }

  /**
   * Convert VAPID key from base64 to Uint8Array
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Get current user ID from auth state
   */
  private getCurrentUserId(): string {
    // Get from your auth service/store
    return localStorage.getItem('user_id') || 'anonymous';
  }

  /**
   * Get authentication token
   */
  private getAuthToken(): string {
    return localStorage.getItem('auth_token') || '';
  }

  /**
   * Detect device type
   */
  private getDeviceType(): 'mobile' | 'desktop' | 'tablet' {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (/mobile|android|iphone|ipad|phone/i.test(userAgent)) {
      return /ipad|tablet/i.test(userAgent) ? 'tablet' : 'mobile';
    }
    
    return 'desktop';
  }

  /**
   * Track notification events for analytics
   */
  private trackNotificationEvent(event: string, data: any): void {
    try {
      // Send to analytics service
      if (typeof gtag !== 'undefined') {
        gtag('event', event, {
          event_category: 'Notifications',
          event_label: data.type || 'unknown',
          custom_parameters: data
        });
      }
    } catch (error) {
      console.error('Failed to track notification event:', error);
    }
  }

  /**
   * Get subscription status
   */
  async getSubscriptionStatus(): Promise<{
    isSubscribed: boolean;
    isSupported: boolean;
    permission: NotificationPermission;
  }> {
    const isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
    const permission = isSupported ? Notification.permission : 'denied';
    const isSubscribed = !!(await this.swRegistration?.pushManager.getSubscription());

    return { isSubscribed, isSupported, permission };
  }

  /**
   * Test notification (for debugging)
   */
  async testNotification(): Promise<void> {
    await this.showLocalNotification({
      title: 'Test Notification',
      body: 'This is a test notification from QualityControl PWA',
      data: {
        priority: 'medium',
        type: 'system',
        timestamp: Date.now()
      }
    });
  }
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();
export type { NotificationPayload, NotificationPreferences, PushSubscriptionData };