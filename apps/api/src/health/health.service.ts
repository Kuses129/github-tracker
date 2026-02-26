import { Injectable } from '@nestjs/common';
import type { HealthResponseModel } from './models/health-response.model';

@Injectable()
export class HealthService {
  getHealth(): HealthResponseModel {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
