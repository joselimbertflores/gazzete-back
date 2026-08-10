import {
  Body,
  Controller,
  Get,
  Param,
  ParseFilePipeBuilder,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { CreateDocumentDto, FindAllDocumentsQueryDto, UpdateDocumentDto, UploadDocumentFileQueryDto } from '../dtos';
import { DocumentService, DocumentTypeService } from '../services';
import { CustomFileTypeValidator } from 'src/modules/files/validators/custom-file-type.validator';
import { GetAuthUser, RequireRole } from 'src/modules/auth/decorators';
import { User, UserRole } from 'src/modules/users/entities';

function documentFilePipe() {
  return new ParseFilePipeBuilder()
    .addValidator(
      new CustomFileTypeValidator({
        validTypes: ['application/pdf'],
      }),
    )
    .addMaxSizeValidator({ maxSize: 20 * 1024 * 1024 })
    .build();
}

@RequireRole(UserRole.USER)
@Controller('documents')
export class DocumentController {
  constructor(
    private documentService: DocumentService,
    private documentTypeService: DocumentTypeService,
  ) {}

  @Get('types')
  getDocumentTypes() {
    return this.documentTypeService.getTypeOptions();
  }

  @Post()
  create(@Body() body: CreateDocumentDto, @GetAuthUser() user: User) {
    return this.documentService.create(body, user);
  }

  @Post('files')
  @UseInterceptors(FileInterceptor('file'))
  uploadForCreate(
    @UploadedFile(documentFilePipe()) file: Express.Multer.File,
    @Query() query: UploadDocumentFileQueryDto,
  ) {
    return this.documentService.uploadFileForCreate(file, query.year);
  }

  @Post(':id/file')
  @UseInterceptors(FileInterceptor('file'))
  uploadForUpdate(@Param('id') id: string, @UploadedFile(documentFilePipe()) file: Express.Multer.File) {
    return this.documentService.uploadFileForUpdate(id, file);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateDocumentDto, @GetAuthUser() user: User) {
    return this.documentService.update(id, body, user);
  }

  @Get()
  findAll(@Query() params: FindAllDocumentsQueryDto) {
    return this.documentService.findAll(params);
  }

  @Get(':id')
  getDocumentDetail(@Param('id') id: string) {
    return this.documentService.getDocumentDetail(id);
  }
}
