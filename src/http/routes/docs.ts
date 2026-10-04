import { Router } from 'express';
import { buildOpenApi } from '../openapi';

export const docsRouter = Router();

let cached: unknown;
const spec = (): unknown => (cached ??= buildOpenApi());

docsRouter.get('/docs/openapi.json', (_req, res) => {
  res.json(spec());
});

/** Swagger UI from a CDN; only mounted outside production (or with ENABLE_DOCS=true). */
docsRouter.get('/docs', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Unsaid API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>window.ui = SwaggerUIBundle({ url: '/docs/openapi.json', dom_id: '#ui', withCredentials: true });</script>
</body></html>`);
});
