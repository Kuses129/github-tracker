import * as crypto from 'crypto';

export function computeSignature(secret: string, body: Buffer | string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

export const mockOrg = { id: 'org-uuid' };
export const mockRepo = { id: 'repo-uuid' };

export const owner = { id: 1001, login: 'acme-org' };
export const repository = {
  id: 2001,
  name: 'backend',
  full_name: 'acme-org/backend',
  private: false,
  html_url: 'https://github.com/acme-org/backend',
  owner,
};
