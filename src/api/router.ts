import { Router } from 'express';
import { Get, Route, Tags } from 'tsoa';

export const apiRouter: Router | null = Router();

/**
 * REST API controller (tsoa decorators → automatic OpenAPI generation).
 */
@Route('api')
export class HealthController {
  /**
   * Health check endpoint
   * Simple health check for monitoring
   */
  @Get('health')
  @Tags('Server')
  public async getHealth(): Promise<{
    status: string;
    timestamp: string;
    version: string;
  }> {
    const { appConfig } = await import('fa-mcp-sdk');

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: appConfig.version || '1.0.0',
    };
  }
}
