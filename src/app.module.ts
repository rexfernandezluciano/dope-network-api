import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PostsModule } from './modules/posts/posts.module';
import { CommentsController } from './modules/comments/comments.controller';
import { CommentsService } from './modules/comments/comments.service';
import { CommentsModule } from './modules/comments/comments.module';
import { ActivityPubModule } from './modules/activitypub/activitypub.module';

@Module({
  imports: [AuthModule, UsersModule, PostsModule, CommentsModule, ActivityPubModule],
  controllers: [AppController, CommentsController],
  providers: [AppService, CommentsService],
})
export class AppModule {}
