import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

type DbUser = {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  publicKeyPem: string | null;
};

type DbOutboxItem = {
  postId: string;
  content: string;
  attachments: unknown;
  poll: unknown;
  createdAt: Date;
};

@Injectable()
export class ActivityPubService {
  private readonly domain = process.env.ACTIVITYPUB_DOMAIN ?? 'dope.eu.org';
  private readonly prisma = new PrismaClient();

  private actorUrl(username: string): string {
    return `https://${this.domain}/users/${username}`;
  }

  private async getUser(username: string): Promise<DbUser> {
    const users = await this.prisma.$queryRaw<DbUser[]>`
      SELECT
        id,
        username,
        "displayName",
        bio,
        "publicKeyPem"
      FROM "User"
      WHERE username = ${username}
      LIMIT 1
    `;

    const user = users[0];
    if (!user) {
      throw new NotFoundException(`User ${username} not found`);
    }

    return user;
  }

  async getWebFinger(acct: string) {
    const username = acct.replace('acct:', '').split('@')[0];
    await this.getUser(username);

    const actorUrl = this.actorUrl(username);
    return {
      subject: `acct:${username}@${this.domain}`,
      aliases: [actorUrl],
      links: [{ rel: 'self', type: 'application/activity+json', href: actorUrl }],
    };
  }

  async getActor(username: string) {
    const user = await this.getUser(username);
    const base = this.actorUrl(username);

    return {
      '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
      id: base,
      type: 'Person',
      preferredUsername: user.username,
      name: user.displayName,
      summary: user.bio,
      inbox: `${base}/inbox`,
      outbox: `${base}/outbox`,
      followers: `${base}/followers`,
      following: `${base}/following`,
      publicKey: {
        id: `${base}#main-key`,
        owner: base,
        publicKeyPem: user.publicKeyPem ?? 'REPLACE_WITH_PRODUCTION_PUBLIC_KEY',
      },
    };
  }

  async getOutbox(username: string) {
    await this.getUser(username);
    const outboxId = `${this.actorUrl(username)}/outbox`;

    const rows = await this.prisma.$queryRaw<DbOutboxItem[]>`
      SELECT
        id as "postId",
        content,
        attachments,
        poll,
        "createdAt"
      FROM "Post"
      WHERE "authorUsername" = ${username}
      ORDER BY "createdAt" DESC
      LIMIT 20
    `;

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: outboxId,
      type: 'OrderedCollection',
      totalItems: rows.length,
      orderedItems: rows.map((row) => ({
        id: `${this.actorUrl(username)}/posts/${row.postId}/activity`,
        type: 'Create',
        actor: this.actorUrl(username),
        published: row.createdAt.toISOString(),
        object: {
          id: `${this.actorUrl(username)}/posts/${row.postId}`,
          type: 'Note',
          attributedTo: this.actorUrl(username),
          content: row.content,
          published: row.createdAt.toISOString(),
          attachment: Array.isArray(row.attachments) ? row.attachments : [],
          oneOf: row.poll && typeof row.poll === 'object' && 'options' in (row.poll as Record<string, unknown>)
            ? ((row.poll as { options: Array<{ text: string }> }).options.map((option) => ({ type: 'Note', name: option.text })))
            : undefined,
        },
      })),
    };
  }

  async acceptInboxActivity(username: string, activity: Record<string, unknown>) {
    await this.getUser(username);

    await this.prisma.$executeRaw`
      INSERT INTO "ActivityInbox" (
        id,
        "username",
        "activityType",
        payload,
        "createdAt"
      ) VALUES (
        gen_random_uuid(),
        ${username},
        ${String(activity.type ?? 'Unknown')},
        ${JSON.stringify(activity)}::jsonb,
        NOW()
      )
    `;

    return {
      ok: true,
      receivedBy: username,
      activityType: activity.type ?? 'Unknown',
    };
  }
}
