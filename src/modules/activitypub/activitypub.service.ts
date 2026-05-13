import { Injectable } from '@nestjs/common';

@Injectable()
export class ActivityPubService {
  private readonly domain = 'dope.eu.org';

  getWebFinger(acct: string) {
    const username = acct.replace('acct:', '').split('@')[0];
    const actorUrl = `https://${this.domain}/users/${username}`;
    return {
      subject: `acct:${username}@${this.domain}`,
      aliases: [actorUrl],
      links: [{ rel: 'self', type: 'application/activity+json', href: actorUrl }],
    };
  }

  getActor(username: string) {
    const base = `https://${this.domain}/users/${username}`;
    return {
      '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
      id: base,
      type: 'Person',
      preferredUsername: username,
      inbox: `${base}/inbox`,
      outbox: `${base}/outbox`,
      followers: `${base}/followers`,
      following: `${base}/following`,
      publicKey: {
        id: `${base}#main-key`,
        owner: base,
        publicKeyPem: 'REPLACE_WITH_PRODUCTION_PUBLIC_KEY',
      },
    };
  }

  getOutbox(username: string) {
    const outboxId = `https://${this.domain}/users/${username}/outbox`;
    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: outboxId,
      type: 'OrderedCollection',
      totalItems: 0,
      orderedItems: [],
    };
  }

  acceptInboxActivity(username: string, activity: Record<string, unknown>) {
    return {
      ok: true,
      receivedBy: username,
      activityType: activity.type ?? 'Unknown',
      note: 'Persist and verify HTTP signatures in production deployment.',
    };
  }
}
