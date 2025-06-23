/**
 * Dynamic preconnect utility for API endpoints
 * Adds preconnect links based on environment configuration
 */

export function setupApiPreconnect(): void {
  const apiUrl = import.meta.env.VITE_API_URL;
  
  if (!apiUrl) {
    console.warn('VITE_API_URL not configured, skipping API preconnect');
    return;
  }

  try {
    const url = new URL(apiUrl);
    const origin = url.origin;

    // Check if preconnect link already exists
    const existingPreconnect = document.querySelector(`link[rel="preconnect"][href="${origin}"]`);
    if (existingPreconnect) {
      return;
    }

    // Add preconnect link
    const preconnectLink = document.createElement('link');
    preconnectLink.rel = 'preconnect';
    preconnectLink.href = origin;
    document.head.appendChild(preconnectLink);

    // Add dns-prefetch as fallback
    const dnsPrefetchLink = document.createElement('link');
    dnsPrefetchLink.rel = 'dns-prefetch';
    dnsPrefetchLink.href = origin;
    document.head.appendChild(dnsPrefetchLink);

    console.log(`API preconnect configured for: ${origin}`);
  } catch (error) {
    console.error('Failed to setup API preconnect:', error);
  }
}