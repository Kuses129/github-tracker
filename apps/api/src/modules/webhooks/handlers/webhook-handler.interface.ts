export interface WebhookHandler {
  handle(payload: unknown): Promise<void>;
}
