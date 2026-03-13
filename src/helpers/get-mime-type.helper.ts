import mime from 'mime';
export const getMimeType = (extension: string) => {
  return mime.getType(extension) ?? extension;
};
