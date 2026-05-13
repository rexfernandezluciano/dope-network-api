import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { AccessToken, LocalAccount, OAuthClient } from './auth.types';

@Injectable()
export class AuthService {
  private readonly accounts = new Map<string, LocalAccount>();
  private readonly accountsByEmail = new Map<string, string>();
  private readonly oauthClients = new Map<string, OAuthClient>();
  private readonly accessTokens = new Map<string, AccessToken>();
  private readonly refreshTokens = new Map<string, string>();

  constructor() {
    this.seedDefaultClient();
  }

  register(input: { username: string; email: string; password: string; displayName?: string }) {
    const normalizedEmail = input.email.trim().toLowerCase();
    if (this.accountsByEmail.has(normalizedEmail)) {
      throw new ConflictException('email already exists');
    }

    const account: LocalAccount = {
      id: randomUUID(),
      username: input.username,
      email: normalizedEmail,
      passwordHash: this.hashPassword(input.password),
      displayName: input.displayName,
      createdAt: new Date(),
    };

    this.accounts.set(account.id, account);
    this.accountsByEmail.set(normalizedEmail, account.id);

    return this.safeAccount(account);
  }

  login(email: string, password: string) {
    const accountId = this.accountsByEmail.get(email.trim().toLowerCase());
    if (!accountId) {
      throw new UnauthorizedException('invalid credentials');
    }

    const account = this.accounts.get(accountId);
    if (!account || account.passwordHash !== this.hashPassword(password)) {
      throw new UnauthorizedException('invalid credentials');
    }

    return this.issueToken({ accountId: account.id, clientId: 'first_party_web', scope: 'read write follow' });
  }

  oauthToken(input: { grantType: string; clientId: string; clientSecret: string; scope?: string; username?: string; password?: string; refreshToken?: string }) {
    const client = this.validateClient(input.clientId, input.clientSecret);

    if (input.grantType === 'password') {
      if (!input.username || !input.password) {
        throw new UnauthorizedException('missing resource owner credentials');
      }
      const accountId = this.accountsByEmail.get(input.username.trim().toLowerCase());
      const account = accountId ? this.accounts.get(accountId) : null;
      if (!account || account.passwordHash !== this.hashPassword(input.password)) {
        throw new UnauthorizedException('invalid credentials');
      }
      return this.issueToken({ accountId: account.id, clientId: client.id, scope: input.scope ?? 'read' });
    }

    if (input.grantType === 'client_credentials') {
      return this.issueToken({ accountId: 'service-account', clientId: client.id, scope: input.scope ?? 'read' });
    }

    if (input.grantType === 'refresh_token') {
      if (!input.refreshToken) {
        throw new UnauthorizedException('missing refresh token');
      }
      const accessTokenKey = this.refreshTokens.get(input.refreshToken);
      const previous = accessTokenKey ? this.accessTokens.get(accessTokenKey) : undefined;
      if (!previous) {
        throw new UnauthorizedException('invalid refresh token');
      }
      return this.issueToken({ accountId: previous.accountId, clientId: previous.clientId, scope: previous.scope });
    }

    throw new UnauthorizedException('unsupported grant_type');
  }

  validateBearerToken(token: string) {
    const existing = this.accessTokens.get(token);
    if (!existing || existing.expiresAt <= new Date()) {
      throw new UnauthorizedException('invalid token');
    }
    return existing;
  }

  private issueToken(input: { accountId: string; clientId: string; scope: string }) {
    const token = randomUUID();
    const refreshToken = randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 2);

    const accessToken: AccessToken = {
      token,
      refreshToken,
      accountId: input.accountId,
      clientId: input.clientId,
      scope: input.scope,
      expiresAt,
    };
    this.accessTokens.set(token, accessToken);
    this.refreshTokens.set(refreshToken, token);

    return {
      access_token: token,
      token_type: 'Bearer',
      scope: input.scope,
      created_at: Math.floor(Date.now() / 1000),
      expires_in: 7200,
      refresh_token: refreshToken,
    };
  }

  private validateClient(clientId: string, clientSecret: string) {
    const client = this.oauthClients.get(clientId);
    if (!client || client.secret !== clientSecret) {
      throw new UnauthorizedException('invalid client');
    }
    return client;
  }

  private safeAccount(account: LocalAccount) {
    return {
      id: account.id,
      username: account.username,
      email: account.email,
      displayName: account.displayName,
      createdAt: account.createdAt,
    };
  }

  private hashPassword(password: string) {
    return createHash('sha256').update(password).digest('hex');
  }

  private seedDefaultClient() {
    this.oauthClients.set('first_party_web', {
      id: 'first_party_web',
      secret: 'change_me_in_production',
      name: 'Dope API Web Client',
      redirectUris: ['https://example.com/callback'],
      scopes: ['read', 'write', 'follow', 'push'],
    });
  }
}
