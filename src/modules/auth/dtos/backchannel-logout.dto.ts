import { IsNotEmpty, IsString } from 'class-validator';

export class BackchannelLogoutDto {
  @IsString()
  @IsNotEmpty()
  logout_token: string;
}
