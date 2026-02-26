import type { HealthResponse } from '@repo/shared';

export class HealthResponseModel implements HealthResponse {
  status!: 'ok' | 'error';
  timestamp!: string;
}
