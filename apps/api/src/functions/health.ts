import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { healthResponseSchema } from '@nuvio/shared';

export async function health(
  _request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: healthResponseSchema.parse({
      status: 'ok',
      service: 'nuvio-api'
    })
  };
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: health
});
