import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('DocumentAccessHeader')
class DocumentAccessHeaderView {
  @Field()
  name!: string;

  @Field()
  value!: string;
}

@ObjectType('DocumentAccess')
export class DocumentAccessView {
  @Field()
  storageKey!: string;

  @Field()
  url!: string;

  @Field()
  method!: string;

  @Field()
  expiresAt!: string;

  @Field(() => [DocumentAccessHeaderView])
  headers!: DocumentAccessHeaderView[];
}
