import 'fastify';

export type AdminIdentity = { id: string; email: string };

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the admin plugin's auth hook; null outside /api/admin. */
    admin: AdminIdentity | null;
  }
}
