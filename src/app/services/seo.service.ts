import { Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

interface SeoConfig {
  title: string;
  description: string;
  url?: string;
  image?: string;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private baseUrl = 'https://www.blacksugar21.com';

  constructor(private meta: Meta, private title: Title) {}

  update(config: SeoConfig): void {
    const fullTitle = config.title.includes('Black Sugar')
      ? config.title
      : `${config.title} - Black Sugar 21`;

    this.title.setTitle(fullTitle);

    const url = config.url ? `${this.baseUrl}${config.url}` : this.baseUrl;
    const image = config.image || `${this.baseUrl}/og-image.png`;

    // Standard meta
    this.meta.updateTag({ name: 'description', content: config.description });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });

    // Open Graph
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: config.description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:image', content: image });

    // Twitter
    this.meta.updateTag({ name: 'twitter:title', content: fullTitle });
    this.meta.updateTag({ name: 'twitter:description', content: config.description });
    this.meta.updateTag({ name: 'twitter:url', content: url });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    // Canonical
    this.updateCanonical(url);
  }

  private updateCanonical(url: string): void {
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (link) {
      link.href = url;
    }
  }
}
