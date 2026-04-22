// Polyfill for libraries that expect a Node.js process global
if (!(window as any).process) {
  (window as any).process = { 
    env: { 
      NODE_ENV: import.meta.env.MODE 
    } 
  } as any;
}
