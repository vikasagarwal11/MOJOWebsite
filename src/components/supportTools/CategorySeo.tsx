import { Helmet } from 'react-helmet-async';
import { SupportToolCategory } from '../../types/supportTools';

interface CategorySeoProps {
  category: SupportToolCategory | null;
  baseUrl?: string;
}

export const CategorySeo: React.FC<CategorySeoProps> = ({ 
  category, 
  baseUrl = 'https://momsfitnessmojo.web.app' 
}) => {
  if (!category) {
    // Default SEO for /support-tools (all categories)
    return (
      <Helmet>
        <title>Support Tools | Moms Fitness Mojo - Healthy Recipes, Exercises & Tips</title>
        <meta name="description" content="Discover healthy recipes, exercises, and wellness tips from our community of moms. Share your favorite recipes, workout routines, and health advice." />
        <meta name="keywords" content="mom fitness, healthy recipes, exercises, wellness tips, mom community, health tips" />
        <link rel="canonical" href={`${baseUrl}/support-tools`} />
        
        {/* Open Graph */}
        <meta property="og:title" content="Support Tools | Moms Fitness Mojo" />
        <meta property="og:description" content="Discover healthy recipes, exercises, and wellness tips from our community of moms." />
        <meta property="og:url" content={`${baseUrl}/support-tools`} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${baseUrl}/assets/logo/facebook-post.svg`} />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Support Tools | Moms Fitness Mojo" />
        <meta name="twitter:description" content="Discover healthy recipes, exercises, and wellness tips from our community of moms." />
        <meta name="twitter:image" content={`${baseUrl}/assets/logo/square-logo.svg`} />
        
        {/* Structured Data - CollectionPage */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": "Support Tools",
            "description": "Healthy recipes, exercises, and wellness tips from Moms Fitness Mojo community",
            "url": `${baseUrl}/support-tools`,
            "mainEntity": {
              "@type": "ItemList",
              "itemListElement": []
            }
          })}
        </script>
      </Helmet>
    );
  }

  // Category-specific SEO
  const title = category.seoTitle || `${category.name} | Moms Fitness Mojo`;
  const description = category.seoDescription || category.description || 
    `Browse ${category.name.toLowerCase()} shared by our community of moms. Find healthy recipes, exercises, and wellness tips.`;
  const url = `${baseUrl}/support-tools/${category.slug}`;
  const keywords = category.seoKeywords?.join(', ') || 
    `${category.name}, mom fitness, healthy recipes, wellness tips, mom community`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <link rel="canonical" href={url} />
      
      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      {category.seoImage && <meta property="og:image" content={category.seoImage} />}
      {!category.seoImage && <meta property="og:image" content={`${baseUrl}/assets/logo/facebook-post.svg`} />}
      
      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {category.seoImage && <meta name="twitter:image" content={category.seoImage} />}
      {!category.seoImage && <meta name="twitter:image" content={`${baseUrl}/assets/logo/square-logo.svg`} />}
      
      {/* Structured Data - CollectionPage for Category */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "name": category.name,
          "description": description,
          "url": url,
          "breadcrumb": {
            "@type": "BreadcrumbList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": baseUrl
              },
              {
                "@type": "ListItem",
                "position": 2,
                "name": "Support Tools",
                "item": `${baseUrl}/support-tools`
              },
              {
                "@type": "ListItem",
                "position": 3,
                "name": category.name,
                "item": url
              }
            ]
          }
        })}
      </script>
    </Helmet>
  );
};






