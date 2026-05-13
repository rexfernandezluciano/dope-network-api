import { ConflictException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
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

  async oauthToken(input: { grantType: string; clientId: string; clientSecret: string; scope?: string; username?: string; password?: string; refreshToken?: string }) {
    const client = await this.validateClient(input.clientId, input.clientSecret);

    if (input.grantType === 'password') {
      if (!input.username || !input.password) throw new UnauthorizedException('missing resource owner credentials');
      const account = await this.prisma.user.findUnique({ where: { email: input.username.trim().toLowerCase() } });
      if (!account || !(await compare(input.password, account.passwordHash))) throw new UnauthorizedException('invalid credentials');
      return this.issueToken({ accountId: account.id, clientId: client.id, scope: input.scope ?? 'read' });
    }

    if (input.grantType === 'client_credentials') {
      return this.issueToken({ accountId: null, clientId: client.id, scope: input.scope ?? 'read' });
    }

    if (input.grantType === 'refresh_token') {
      if (!input.refreshToken) throw new UnauthorizedException('missing refresh token');
      const existing = await this.prisma.accessToken.findUnique({ where: { refreshHash: this.digest(input.refreshToken) } });
      if (!existing || existing.revokedAt || existing.expiresAt <= new Date()) throw new UnauthorizedException('invalid refresh token');
      return this.issueToken({ accountId: existing.userId, clientId: existing.clientId, scope: existing.scope });
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

  private async issueToken(input: { accountId: string | null; clientId: string; scope: string }) {
    const token = randomUUID();
    const refreshToken = randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 2);

    await this.prisma.accessToken.create({
      data: {
        tokenHash: this.digest(token),
        refreshHash: this.digest(refreshToken),
        scope: input.scope,
        expiresAt,
        clientId: input.clientId,
        userId: input.accountId,
      },
    });

    return {
      access_token: token,
      token_type: 'Bearer',
      scope: input.scope,
      created_at: Math.floor(Date.now() / 1000),
      expires_in: 7200,
      refresh_token: refreshToken,
    };
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

  private async ensureDefaultClient() {
    await this.prisma.oAuthClient.upsert({
      where: { id: 'first_party_web' },
      update: {},
      create: {
        id: 'first_party_web',
        secretHash: await hash('change_me_in_production', 12),
        name: 'Dope API Web Client',
        redirectUris: ['https://example.com/callback'],
        scopes: ['read', 'write', 'follow', 'push'],
      },
    });
  }
}
