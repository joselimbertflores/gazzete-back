import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from 'src/config';
import { Public } from 'src/modules/auth/decorators';
import { PublicDocumentsService } from '../services';

@Public()
@Controller()
export class PublicSeoController {
  constructor(
    private readonly publicDocumentsService: PublicDocumentsService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async getSitemap(): Promise<string> {
    const documents = await this.publicDocumentsService.getSitemapDocuments();
    const staticUrls = [this.buildPublicUrl('/'), this.buildPublicUrl('/normativas')];
    const documentUrls = documents.map(({ slug, updatedAt }) => ({
      location: this.buildPublicUrl(`/normativas/${encodeURIComponent(slug)}`),
      lastModified: new Date(updatedAt).toISOString(),
    }));

    const entries = [
      ...staticUrls.map((location) => `  <url>\n    <loc>${this.escapeXml(location)}</loc>\n  </url>`),
      ...documentUrls.map(
        ({ location, lastModified }) =>
          `  <url>\n    <loc>${this.escapeXml(location)}</loc>\n    <lastmod>${lastModified}</lastmod>\n  </url>`,
      ),
    ];

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...entries,
      '</urlset>',
      '',
    ].join('\n');
  }

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  getRobots(): string {
    return [
      'User-agent: *',
      'Disallow: /admin/',
      'Disallow: /auth/',
      '',
      `Sitemap: ${this.buildPublicUrl('/sitemap.xml')}`,
      '',
    ].join('\n');
  }

  private buildPublicUrl(path: string): string {
    const baseUrl =
      this.configService.get('GAZETTE_UI_URL', { infer: true }) ||
      this.configService.getOrThrow('GAZETTE_PUBLIC_URL', { infer: true });

    return new URL(path, baseUrl).toString();
  }

  private escapeXml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }
}
