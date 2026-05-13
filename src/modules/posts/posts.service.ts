import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreatePostDto } from './dto/create-post.dto';

@Injectable()
export class PostsService {
  private readonly posts: Array<{
    id: string;
    authorUsername: string;
    content: string;
    attachments: unknown[];
    poll: unknown | null;
    createdAt: Date;
  }> = [];

  async createPost(dto: CreatePostDto) {
    const post = {
      id: randomUUID(),
      authorUsername: dto.authorUsername,
      content: dto.content,
      attachments: dto.attachments ?? [],
      poll: dto.poll ?? null,
      createdAt: new Date(),
    };

    this.posts.push(post);
    return post;
  }
}
