// QualityControl Healthcare PWA Service Worker
// Version 1.0.0 - Production Ready
// Cache Strategy: App Shell + Runtime Caching with Workbox patterns

const CACHE_NAME = 'qualitycontrol-v1.0.0';
const RUNTIME_CACHE = 'qualitycontrol-runtime-v1.0.0';
const OFFLINE_CACHE = 'qualitycontrol-offline-v1.0.0';
const API_CACHE = 'qualitycontrol-api-v1.0.0';

// App Shell - Critical files that should always be cached
const APP_SHELL = [
  '/',
  '/index.html',
  '/static/js/main.js',
  '/static/css/main.css',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  // Offline fallback pages
  '/offline.html',
  '/login',
  '/dashboard'
];

// API endpoints that should be cached for offline access
// Using relative patterns to work with any API domain
const CACHE_API_PATTERNS = [
  /\/api\/cases\/priority/,
  /\/api\/cases\/emergency/,
  /\/api\/auth\/profile/,
  /\/api\/dashboard\/stats/
];

// Network-first patterns for real-time data
// Using relative patterns to work with any API domain
const NETWORK_FIRST_PATTERNS = [
  /\/api\/cases\/live/,
  /\/api\/notifications/,
  /\/api\/sync/
];

// Healthcare-specific offline data
const OFFLINE_DATA_KEYS = [
  'emergency-contacts',
  'medical-protocols',
  'case-templates',
  'critical-alerts'
];

// Service Worker Events
self.addEventListener('install', (event) => {
  console.log('[SW] Installing QualityControl Service Worker v1.0.0');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache app shell:', error);
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating QualityControl Service Worker v1.0.0');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && 
                cacheName !== RUNTIME_CACHE && 
                cacheName !== OFFLINE_CACHE &&
                cacheName !== API_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Claim all clients
      self.clients.claim(),
      // Initialize offline data
      initializeOfflineData()
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    // Handle POST requests for offline data sync
    if (request.method === 'POST' && url.pathname.includes('/api/')) {
      event.respondWith(handleApiPost(request));
    }
    return;
  }
  
  // Route requests to appropriate cache strategy
  if (isAppShellRequest(request)) {
    event.respondWith(handleAppShell(request));
  } else if (isApiRequest(request)) {
    event.respondWith(handleApiRequest(request));
  } else if (isStaticAsset(request)) {
    event.respondWith(handleStaticAsset(request));
  } else {
    event.respondWith(handleGeneric(request));
  }
});

// Cache Strategy Handlers

// Cache First - App Shell
async function handleAppShell(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('[SW] App shell request failed:', error);
    return caches.match('/offline.html');
  }
}

// Network First with Fallback - API Requests
async function handleApiRequest(request) {
  const url = new URL(request.url);
  
  // Check if this is a network-first pattern
  const isNetworkFirst = NETWORK_FIRST_PATTERNS.some(pattern => pattern.test(request.url));
  
  if (isNetworkFirst) {
    return handleNetworkFirstApi(request);
  } else {
    return handleCacheFirstApi(request);
  }
}

async function handleNetworkFirstApi(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE);
      await cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    
    // If network fails, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Add offline indicator to cached response
      return addOfflineHeader(cachedResponse);
    }
    
    return createOfflineResponse(request);
  } catch (error) {
    console.error('[SW] Network-first API request failed:', error);
    const cachedResponse = await caches.match(request);
    return cachedResponse || createOfflineResponse(request);
  }
}

async function handleCacheFirstApi(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Update cache in background
      updateCacheInBackground(request);
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE);
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache-first API request failed:', error);
    return createOfflineResponse(request);
  }
}

// Stale While Revalidate - Static Assets
async function handleStaticAsset(request) {
  try {
    const cachedResponse = await caches.match(request);
    const networkResponse = fetch(request).then(response => {
      if (response.ok) {
        const cache = caches.open(RUNTIME_CACHE);
        cache.then(c => c.put(request, response.clone()));
      }
      return response;
    });
    
    return cachedResponse || networkResponse;
  } catch (error) {
    console.error('[SW] Static asset request failed:', error);
    return caches.match(request);
  }
}

// Generic request handler
async function handleGeneric(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    return cachedResponse || caches.match('/offline.html');
  }
}

// POST Request Handler for Offline Sync
async function handleApiPost(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      return networkResponse;
    }
  } catch (error) {
    // Store for background sync
    await storeOfflineRequest(request);
  }
  
  // Return offline response
  return new Response(JSON.stringify({
    success: false,
    offline: true,
    message: 'Request queued for sync when online'
  }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Utility Functions

function isAppShellRequest(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin && (
    APP_SHELL.includes(url.pathname) ||
    url.pathname === '/' ||
    url.pathname.startsWith('/dashboard') ||
    url.pathname.startsWith('/cases') ||
    url.pathname.startsWith('/login')
  );
}

function isApiRequest(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith('/api/');
}

function isStaticAsset(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith('/static/') ||
         url.pathname.includes('.js') ||
         url.pathname.includes('.css') ||
         url.pathname.includes('.png') ||
         url.pathname.includes('.jpg') ||
         url.pathname.includes('.svg');
}

function addOfflineHeader(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Served-From', 'cache');
  headers.set('X-Offline-Mode', 'true');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

function createOfflineResponse(request) {
  const url = new URL(request.url);
  
  if (url.pathname.includes('/api/')) {
    return new Response(JSON.stringify({
      error: 'Offline mode',
      message: 'This request requires an internet connection',
      offline: true
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return caches.match('/offline.html');
}

async function updateCacheInBackground(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE);
      await cache.put(request, networkResponse);
    }
  } catch (error) {
    console.log('[SW] Background cache update failed:', error);
  }
}

async function storeOfflineRequest(request) {
  try {
    const requestData = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: await request.text(),
      timestamp: Date.now()
    };
    
    // Store in IndexedDB for background sync
    const db = await openOfflineDB();
    const transaction = db.transaction(['offline_requests'], 'readwrite');
    const store = transaction.objectStore('offline_requests');
    await store.add(requestData);
  } catch (error) {
    console.error('[SW] Failed to store offline request:', error);
  }
}

async function initializeOfflineData() {
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    
    // Cache critical healthcare data
    const offlineData = {
      'emergency-contacts': {
        data: [
          { name: 'Emergency Services', phone: '911' },
          { name: 'Poison Control', phone: '1-800-222-1222' },
          { name: 'Hospital Security', phone: 'ext. 2911' }
        ]
      },
      'medical-protocols': {
        data: [
          { id: 'cardiac-arrest', title: 'Cardiac Arrest Protocol', priority: 'critical' },
          { id: 'stroke', title: 'Stroke Assessment', priority: 'critical' },
          { id: 'infection-control', title: 'Infection Control', priority: 'high' }
        ]
      }
    };
    
    for (const [key, value] of Object.entries(offlineData)) {
      const response = new Response(JSON.stringify(value), {
        headers: { 'Content-Type': 'application/json' }
      });
      await cache.put(`/offline-data/${key}`, response);
    }
  } catch (error) {
    console.error('[SW] Failed to initialize offline data:', error);
  }
}

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('QualityControlOffline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('offline_requests')) {
        const store = db.createObjectStore('offline_requests', { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// Background Sync Event
self.addEventListener('sync', (event) => {
  if (event.tag === 'qualitycontrol-sync') {
    event.waitUntil(syncOfflineRequests());
  }
});

async function syncOfflineRequests() {
  try {
    const db = await openOfflineDB();
    const transaction = db.transaction(['offline_requests'], 'readonly');
    const store = transaction.objectStore('offline_requests');
    const requests = await store.getAll();
    
    for (const requestData of requests) {
      try {
        const response = await fetch(requestData.url, {
          method: requestData.method,
          headers: requestData.headers,
          body: requestData.body
        });
        
        if (response.ok) {
          // Remove from offline storage
          const deleteTransaction = db.transaction(['offline_requests'], 'readwrite');
          const deleteStore = deleteTransaction.objectStore('offline_requests');
          await deleteStore.delete(requestData.id);
        }
      } catch (error) {
        console.error('[SW] Failed to sync request:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// Push Notification Event
self.addEventListener('push', (event) => {
  console.log('[SW] Push message received');
  
  let notificationData = {
    title: 'QualityControl Alert',
    body: 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: 'qualitycontrol-notification',
    requireInteraction: false,
    data: {}
  };
  
  if (event.data) {
    try {
      const pushData = event.data.json();
      notificationData = {
        ...notificationData,
        ...pushData
      };
    } catch (error) {
      console.error('[SW] Failed to parse push data:', error);
    }
  }
  
  // Determine notification priority based on healthcare context
  if (notificationData.priority === 'critical' || notificationData.type === 'emergency') {
    notificationData.requireInteraction = true;
    notificationData.vibrate = [200, 100, 200, 100, 200];
    notificationData.sound = '/sounds/emergency-alert.mp3';
  }
  
  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/dashboard';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to focus existing window
        for (const client of clientList) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Message Event for communication with main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type) {
    switch (event.data.type) {
      case 'SKIP_WAITING':
        self.skipWaiting();
        break;
      case 'GET_CACHE_STATUS':
        event.ports[0].postMessage({
          type: 'CACHE_STATUS',
          cacheSize: getCacheSize()
        });
        break;
      case 'CLEAR_CACHE':
        clearAllCaches().then(() => {
          event.ports[0].postMessage({
            type: 'CACHE_CLEARED'
          });
        });
        break;
    }
  }
});

async function getCacheSize() {
  try {
    const cacheNames = await caches.keys();
    let totalSize = 0;
    
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      totalSize += keys.length;
    }
    
    return totalSize;
  } catch (error) {
    console.error('[SW] Failed to get cache size:', error);
    return 0;
  }
}

async function clearAllCaches() {
  try {
    const cacheNames = await caches.keys();
    return Promise.all(
      cacheNames.map(cacheName => caches.delete(cacheName))
    );
  } catch (error) {
    console.error('[SW] Failed to clear caches:', error);
  }
}

console.log('[SW] QualityControl Service Worker v1.0.0 loaded');