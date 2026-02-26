import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { computeSignature } from '../../../test/webhook.helpers';
import { WebhookSignatureGuard } from '../webhook-signature.guard';

const TEST_SECRET = 'test-secret';

function buildContext(headers: Record<string, string>, rawBody: Buffer): ExecutionContext {
  const request = { headers, rawBody };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('WebhookSignatureGuard', () => {
  let guard: WebhookSignatureGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookSignatureGuard,
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue(TEST_SECRET) },
        },
      ],
    }).compile();

    guard = module.get<WebhookSignatureGuard>(WebhookSignatureGuard);
  });

  it('throws UnauthorizedException when x-hub-signature-256 header is missing', () => {
    const ctx = buildContext({}, Buffer.from('payload'));
    expect(() => guard.canActivate(ctx)).toThrow(
      new UnauthorizedException('Missing webhook signature'),
    );
  });

  it('throws UnauthorizedException when signature is signed with wrong secret', () => {
    const body = Buffer.from('payload');
    const signature = computeSignature('wrong-secret', body);
    const ctx = buildContext({ 'x-hub-signature-256': signature }, body);
    expect(() => guard.canActivate(ctx)).toThrow(
      new UnauthorizedException('Invalid webhook signature'),
    );
  });

  it('returns true when signature matches', () => {
    const body = Buffer.from('payload');
    const signature = computeSignature(TEST_SECRET, body);
    const ctx = buildContext({ 'x-hub-signature-256': signature }, body);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws UnauthorizedException when payload differs from what was signed', () => {
    const signedBody = Buffer.from('original-payload');
    const tamperedBody = Buffer.from('tampered-payload');
    const signature = computeSignature(TEST_SECRET, signedBody);
    const ctx = buildContext({ 'x-hub-signature-256': signature }, tamperedBody);
    expect(() => guard.canActivate(ctx)).toThrow(
      new UnauthorizedException('Invalid webhook signature'),
    );
  });
});
