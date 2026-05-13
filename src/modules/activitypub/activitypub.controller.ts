import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ActivityPubService } from './activitypub.service';

@Controller()
export class ActivityPubController {
  constructor(private readonly activityPubService: ActivityPubService) {}

  @Get('.well-known/webfinger')
  webfinger(@Query('resource') resource: string) {
    return this.activityPubService.getWebFinger(resource);
  }

  @Get('users/:username')
  actor(@Param('username') username: string) {
    return this.activityPubService.getActor(username);
  }

  @Get('users/:username/outbox')
  outbox(@Param('username') username: string) {
    return this.activityPubService.getOutbox(username);
  }

  @Post('users/:username/inbox')
  inbox(@Param('username') username: string, @Body() activity: Record<string, unknown>) {
    return this.activityPubService.acceptInboxActivity(username, activity);
  }
}
