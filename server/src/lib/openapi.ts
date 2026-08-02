import { extendZodWithOpenApi, OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

// Single shared registry — every module's routes.ts registers its paths and
// schemas into this at import time; app.ts generates the document from it
// once all route modules have loaded.
export const openApiRegistry = new OpenAPIRegistry();

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(openApiRegistry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'UCR Fleet ERP API',
      version: '2.0.0-phase2',
      description:
        'Staff API (/api/v1) and driver-scoped mobile API (/api/driver/v1) for Ulagammal Car Rental.',
    },
    servers: [{ url: '/api' }],
  });
}

export const bearerAuth = openApiRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});
