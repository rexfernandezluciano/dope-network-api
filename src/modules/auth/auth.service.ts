import { BadRequestException, ConflictException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { randomBytes, randomUUID, createHash, createHmac } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureDefaultClient();
  }

  async register(input: { username: string; email: string; password: string; displayName?: string }) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: normalizedEmail }, { username: input.username }] },
    });
    if (existing) {
      throw new ConflictException('user already exists');
    }

    const created = await this.prisma.user.create({
      data: {
        username: input.username,
        email: normalizedEmail,
        passwordHash: await hash(input.password, 12),
        displayName: input.displayName,
      },
    });

    return this.safeUser(created);
  }

  async login(email: string, password: string) {
    const account = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!account || !(await compare(password, account.passwordHash))) {
      throw new UnauthorizedException('invalid credentials');
    }

    return this.issueToken({ accountId: account.id, clientId: 'first_party_web', scope: 'read write follow' });
  }


  async createOAuthClient(input: { id: string; name: string; redirectUris: string[]; scopes: string[] }) {
    const id = input.id.trim();
    const name = input.name.trim();
    const redirectUris = [...new Set(input.redirectUris.map((uri) => uri.trim()))];
    const scopes = [...new Set(input.scopes.map((scope) => scope.trim()))];

    if (!/^[a-z0-9_-]{3,64}$/.test(id)) throw new BadRequestException('invalid client id format');
    if (name.length < 3 || name.length > 100) throw new BadRequestException('invalid client name length');
    if (!redirectUris.length || redirectUris.length > 10) throw new BadRequestException('invalid redirect URIs');
    if (!scopes.length || scopes.length > 20) throw new BadRequestException('invalid scopes');

    for (const uri of redirectUris) {
      let parsed: URL;
      try {
        parsed = new URL(uri);
      } catch {
        throw new BadRequestException('invalid redirect URI');
      }
      if (parsed.protocol !== 'https:' || !parsed.hostname) throw new BadRequestException('redirect URI must be https');
    }

    if (scopes.some((scope) => !/^[a-z][a-z:_-]{0,63}$/.test(scope))) {
      throw new BadRequestException('invalid scope format');
    }

    const existing = await this.prisma.oAuthClient.findUnique({ where: { id } });
    if (existing) throw new ConflictException('oauth client already exists');

    const clientSecret = randomBytes(48).toString('hex');
    await this.prisma.oAuthClient.create({
      data: {
        id,
        name,
        redirectUris,
        scopes,
        secretHash: await hash(clientSecret, 12),
      },
    });

    return { client_id: id, client_secret: clientSecret, name, redirect_uris: redirectUris, scopes };
  }

  async oauthToken(input: { grantType: string; clientId: string; clientSecret: string; scope?: string; username?: string; password?: string; refreshToken?: string; nonce?: string }) {
    const client = await this.validateClient(input.clientId, input.clientSecret);

    if (input.grantType === 'password') {
      if (!input.username || !input.password) throw new UnauthorizedException('missing resource owner credentials');
      const account = await this.prisma.user.findUnique({ where: { email: input.username.trim().toLowerCase() } });
      if (!account || !(await compare(input.password, account.passwordHash))) throw new UnauthorizedException('invalid credentials');
      return this.issueToken({ accountId: account.id, clientId: client.id, scope: input.scope ?? 'read', nonce: input.nonce });
    }

    if (input.grantType === 'client_credentials') {
      return this.issueToken({ accountId: null, clientId: client.id, scope: input.scope ?? 'read', nonce: input.nonce });
    }

    if (input.grantType === 'refresh_token') {
      if (!input.refreshToken) throw new UnauthorizedException('missing refresh token');
      const existing = await this.prisma.accessToken.findUnique({ where: { refreshHash: this.digest(input.refreshToken) } });
      if (!existing || existing.revokedAt || existing.refreshExpiresAt <= new Date()) throw new UnauthorizedException('invalid refresh token');
      return this.issueToken({ accountId: existing.userId, clientId: existing.clientId, scope: existing.scope, nonce: input.nonce });
    }

    throw new UnauthorizedException('unsupported grant_type');
  }

  async validateBearerToken(token: string) {
    const existing = await this.prisma.accessToken.findUnique({
      where: { tokenHash: this.digest(token) },
      include: { user: true, client: true },
    });
    if (!existing || existing.revokedAt || existing.expiresAt <= new Date()) {
      throw new UnauthorizedException('invalid token');
    }
    return existing;
  }

  private async issueToken(input: { accountId: string | null; clientId: string; scope: string; nonce?: string }) {
    const token = randomUUID();
    const refreshToken = randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 2);
    const refreshExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

    const scopes = input.scope.split(/\s+/).filter(Boolean);

    await this.prisma.accessToken.create({
      data: {
        tokenHash: this.digest(token),
        refreshHash: this.digest(refreshToken),
        scope: input.scope,
        expiresAt,
        refreshExpiresAt,
        clientId: input.clientId,
        userId: input.accountId,
      },
    });

    const response: Record<string, string | number> = {
      access_token: token,
      token_type: 'Bearer',
      scope: input.scope,
      created_at: Math.floor(Date.now() / 1000),
      expires_in: 7200,
      refresh_token: refreshToken,
    };

    if (input.accountId && scopes.includes('openid')) {
      response.id_token = this.signIdToken({
        sub: input.accountId,
        aud: input.clientId,
        nonce: input.nonce,
        expiresInSeconds: 7200,
      });
    }

    return response;
  }

  private async validateClient(clientId: string, clientSecret: string) {
    const client = await this.prisma.oAuthClient.findUnique({ where: { id: clientId } });
    if (!client || !(await compare(clientSecret, client.secretHash))) {
      throw new UnauthorizedException('invalid client');
    }
    return client;
  }

  private safeUser(user: { id: string; username: string; email: string; displayName: string | null; createdAt: Date }) {
    return { id: user.id, username: user.username, email: user.email, displayName: user.displayName, createdAt: user.createdAt };
  }

  private digest(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }




  async userInfo(token: string) {
    const access = await this.validateBearerToken(token);
    return this.userInfoFromAccess(access);
  }

  userInfoFromAccess(access: { userId: string | null; scope: string; user?: { username?: string | null; email?: string | null; displayName?: string | null } | null }) {
    if (!access.userId) throw new UnauthorizedException('userinfo requires a user token');
    const scopes = access.scope.split(/\s+/).filter(Boolean);
    if (!scopes.includes('openid')) throw new UnauthorizedException('openid scope is required');

    return {
      sub: access.userId,
      preferred_username: access.user?.username ?? null,
      email: access.user?.email ?? null,
      name: access.user?.displayName ?? null,
    };
  }

  getOpenIdConfiguration(issuer: string) {
    return {
      issuer,
      token_endpoint: `${issuer}/oauth/token`,
      userinfo_endpoint: `${issuer}/oauth/userinfo`,
      introspection_endpoint: `${issuer}/oauth/introspect`,
      grant_types_supported: ['password', 'client_credentials', 'refresh_token'],
      response_types_supported: ['token'],
      scopes_supported: ['openid', 'read', 'write', 'follow', 'push'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['HS256'],
    };
  }

  private signIdToken(input: { sub: string; aud: string; nonce?: string; expiresInSeconds: number }) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.issuer(),
      sub: input.sub,
      aud: input.aud,
      iat: now,
      exp: now + input.expiresInSeconds,
      ...(input.nonce ? { nonce: input.nonce } : {}),
    };

    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = this.base64Url(JSON.stringify(header));
    const encodedPayload = this.base64Url(JSON.stringify(payload));
    const signature = createHmac('sha256', this.oidcSigningSecret()).update(`${encodedHeader}.${encodedPayload}`).digest('base64url');
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private base64Url(value: string) {
    return Buffer.from(value).toString('base64url');
  }

  private issuer() {
    return process.env.OIDC_ISSUER ?? 'http://localhost:3000';
  }

  private oidcSigningSecret() {
    return process.env.OIDC_SIGNING_SECRET ?? this.defaultClientSecret();
  }
  private defaultClientSecret() {
    return process.env.DEFAULT_OAUTH_CLIENT_SECRET ?? randomBytes(48).toString('hex');
  }

  private async ensureDefaultClient() {
    await this.prisma.oAuthClient.upsert({
      where: { id: 'first_party_web' },
      update: {},
      create: {
        id: 'first_party_web',
        secretHash: await hash(this.defaultClientSecret(), 12),
        name: 'Dope API Web Client',
        redirectUris: ['https://example.com/callback'],
        scopes: ['read', 'write', 'follow', 'push'],
      },
    });
  }
}
