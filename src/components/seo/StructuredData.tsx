import React from 'react';

interface OrganizationSchemaProps {
  name?: string;
  description?: string;
  url?: string;
  logo?: string;
  email?: string;
  phone?: string;
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
}

export const OrganizationSchema: React.FC<OrganizationSchemaProps> = ({
  name = "Moms Fitness Mojo",
  description = "A supportive fitness community for moms to connect, share fitness journeys, and grow together",
  url = "https://momsfitnessmojo.com",
  logo = "https://momsfitnessmojo.com/logo.png",
  email = "momsfitnessmojo@gmail.com",
  phone,
  socialMedia = {}
}) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": name,
    "description": description,
    "url": url,
    "logo": logo,
    "email": email,
    ...(phone && { "telephone": phone }),
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer service",
      "email": email,
      ...(phone && { "telephone": phone })
    },
    ...(Object.keys(socialMedia).length > 0 && {
      "sameAs": Object.values(socialMedia).filter(Boolean)
    }),
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Short Hills",
      "addressRegion": "NJ",
      "addressCountry": "US"
    },
    "foundingDate": "2024",
    "knowsAbout": ["Fitness", "Women's Health", "Community Building", "Wellness", "Motherhood"]
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
};

interface EventSchemaProps {
  name: string;
  description: string;
  startDate: string;
  endDate?: string;
  location: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  organizer?: string;
  price?: number;
  priceCurrency?: string;
  image?: string;
  eventStatus?: "EventScheduled" | "EventCancelled" | "EventPostponed";
  eventAttendanceMode?: "OfflineEventAttendanceMode" | "OnlineEventAttendanceMode" | "MixedEventAttendanceMode";
}

export const EventSchema: React.FC<EventSchemaProps> = ({
  name,
  description,
  startDate,
  endDate,
  location,
  organizer = "Moms Fitness Mojo",
  price,
  priceCurrency = "USD",
  image,
  eventStatus = "EventScheduled",
  eventAttendanceMode = "OfflineEventAttendanceMode"
}) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": name,
    "description": description,
    "startDate": startDate,
    ...(endDate && { "endDate": endDate }),
    "location": {
      "@type": "Place",
      "name": location.name,
      ...(location.address && {
        "address": {
          "@type": "PostalAddress",
          "streetAddress": location.address,
          ...(location.city && { "addressLocality": location.city }),
          ...(location.state && { "addressRegion": location.state }),
          ...(location.zipCode && { "postalCode": location.zipCode }),
          "addressCountry": "US"
        }
      })
    },
    "organizer": {
      "@type": "Organization",
      "name": organizer,
      "url": "https://momsfitnessmojo.com"
    },
    ...(price && {
      "offers": {
        "@type": "Offer",
        "price": price.toString(),
        "priceCurrency": priceCurrency,
        "availability": "https://schema.org/InStock",
        "url": "https://momsfitnessmojo.com/events"
      }
    }),
    ...(image && { "image": image }),
    "eventStatus": `https://schema.org/${eventStatus}`,
    "eventAttendanceMode": `https://schema.org/${eventAttendanceMode}`,
    "audience": {
      "@type": "Audience",
      "audienceType": "Moms and Women"
    }
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
};

interface LocalBusinessSchemaProps {
  name?: string;
  description?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  phone?: string;
  email?: string;
  openingHours?: string[];
  priceRange?: string;
  categories?: string[];
}

export const LocalBusinessSchema: React.FC<LocalBusinessSchemaProps> = ({
  name = "Moms Fitness Mojo",
  description = "A supportive fitness community for moms to connect, share fitness journeys, and grow together",
  address,
  phone,
  email = "momsfitnessmojo@gmail.com",
  openingHours = ["Mo-Fr 09:00-17:00"],
  priceRange = "$$",
  categories = ["Fitness Center", "Community Organization", "Health Club"]
}) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": name,
    "description": description,
    "email": email,
    ...(phone && { "telephone": phone }),
    ...(address && {
      "address": {
        "@type": "PostalAddress",
        "streetAddress": address.street,
        "addressLocality": address.city,
        "addressRegion": address.state,
        "postalCode": address.zipCode,
        "addressCountry": "US"
      }
    }),
    "openingHours": openingHours,
    "priceRange": priceRange,
    "category": categories,
    "url": "https://momsfitnessmojo.com",
    "logo": "https://momsfitnessmojo.com/logo.png"
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
};

interface PersonSchemaProps {
  name: string;
  description?: string;
  image?: string;
  jobTitle?: string;
  worksFor?: string;
  email?: string;
  sameAs?: string[];
}

export const PersonSchema: React.FC<PersonSchemaProps> = ({
  name,
  description,
  image,
  jobTitle = "Founder",
  worksFor = "Moms Fitness Mojo",
  email,
  sameAs = []
}) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": name,
    ...(description && { "description": description }),
    ...(image && { "image": image }),
    "jobTitle": jobTitle,
    "worksFor": {
      "@type": "Organization",
      "name": worksFor,
      "url": "https://momsfitnessmojo.com"
    },
    ...(email && { "email": email }),
    ...(sameAs.length > 0 && { "sameAs": sameAs })
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
};
