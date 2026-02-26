export interface ErrorResponse {
  statusCode: number;
  message: string;
  correlationId: string;
  timestamp: string;
  path: string;
}
