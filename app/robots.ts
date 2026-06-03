import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/login'], // Prevent Google from indexing private areas
    },
    sitemap: 'https://leadvelox.xyz/sitemap.xml',
  };
}
