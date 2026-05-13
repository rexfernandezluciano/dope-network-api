import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class PostAttachmentDto {
  @IsString()
  @IsNotEmpty()
  type!: 'image' | 'video' | 'audio' | 'document';

  @IsUrl()
  url!: string;

  @IsOptional()
  @IsString()
  mediaType?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

class PostPollOptionDto {
  @IsString()
  @IsNotEmpty()
  text!: string;
}

class PostPollDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PostPollOptionDto)
  options!: PostPollOptionDto[];

  @IsInt()
  @Min(1)
  @Max(10080)
  expiresInMinutes!: number;

  @IsOptional()
  multipleChoice?: boolean;
}

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  authorUsername!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PostAttachmentDto)
  attachments?: PostAttachmentDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PostPollDto)
  poll?: PostPollDto;
}
