// Debug script to check environment variables at build time
console.log('=== Build-time Environment Check ===');
console.log('VITE_CONVEX_URL:', process.env.VITE_CONVEX_URL || 'NOT SET');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('CONTEXT:', process.env.CONTEXT || 'unknown');
console.log('URL:', process.env.URL || 'not set');
console.log('====================================');
