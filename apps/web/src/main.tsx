import { z } from 'zod';

// Zod 4 probes `new Function('')` when the first schema is built: under a strict CSP the probe is
// blocked and reported as a violation even though Zod survives it. `jitless` skips the probe, but
// only if it is set before any schema exists, hence the dynamic import of the app.
z.config({ jitless: true });
await import('./bootstrap');
