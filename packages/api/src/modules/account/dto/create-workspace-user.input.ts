import { Field, ID, InputType } from '@nestjs/graphql';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

@InputType()
export class CreateWorkspaceUserInput {
  @Field()
  @IsEmail()
  email!: string;

  // This is a controlled MVP provisioning path. The invitation/token delivery
  // workflow will replace it when the notification module gains email delivery.
  @Field()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @Field()
  @IsIn(['tethrAdmin', 'tethrHr', 'clientAdmin', 'clientMember', 'employee'])
  roleKey!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  employeeId?: string | null;
}
