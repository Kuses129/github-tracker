import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-hub-signature-256'] as
      | string
      | undefined;

    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const secret = this.config.getOrThrow<string>('GITHUB_WEBHOOK_SECRET');
    const rawBody: Buffer = request.rawBody;

    const expected = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')}`;

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
