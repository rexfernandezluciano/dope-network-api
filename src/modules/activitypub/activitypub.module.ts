import { Module } from '@nestjs/common';
import { ActivityPubController } from './activitypub.controller';
import { ActivityPubService } from './activitypub.service';

@Module({
  controllers: [ActivityPubController],
  providers: [ActivityPubService],
})
export class ActivityPubModule {}
