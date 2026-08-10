import slugify from 'slugify';

export const generateSlug = (text: string): string => {
  return slugify(text, {
    replacement: '-',
    lower: true,
    strict: true,
    trim: true,
    locale: 'es',
  });
};
