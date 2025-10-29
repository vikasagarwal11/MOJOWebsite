import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit as limitQuery,
  onSnapshot,
  QueryConstraint,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Testimonial, TestimonialStatus } from '../types';

export interface UseTestimonialsOptions {
  statuses?: TestimonialStatus[];
  featuredOnly?: boolean;
  userId?: string;
  limit?: number;
  orderByField?: 'createdAt' | 'updatedAt' | 'publishedAt';
  orderDirection?: 'asc' | 'desc';
  prioritizeFeatured?: boolean;
  disabled?: boolean;
}

interface UseTestimonialsResult {
  testimonials: Testimonial[];
  loading: boolean;
  error: Error | null;
}

const DEFAULT_ORDER_FIELD: UseTestimonialsOptions['orderByField'] = 'createdAt';

export function useTestimonials(options: UseTestimonialsOptions = {}): UseTestimonialsResult {
  const {
    statuses,
    featuredOnly = false,
    userId,
    limit,
    orderByField = DEFAULT_ORDER_FIELD,
    orderDirection = 'desc',
    prioritizeFeatured = true,
    disabled = false,
  } = options;

  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const constraintsKey = useMemo(
    () => JSON.stringify({ statuses, featuredOnly, userId, limit, orderByField, orderDirection, disabled }),
    [statuses, featuredOnly, userId, limit, orderByField, orderDirection, disabled]
  );

  useEffect(() => {
    if (disabled) {
      setTestimonials([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const constraints: QueryConstraint[] = [];
    const testimonialsRef = collection(db, 'testimonials');

    if (userId) {
      constraints.push(where('userId', '==', userId));
    }

    if (featuredOnly) {
      constraints.push(where('featured', '==', true));
    }

    if (statuses && statuses.length > 0) {
      if (statuses.length === 1) {
        constraints.push(where('status', '==', statuses[0]));
      } else {
        constraints.push(where('status', 'in', statuses.slice(0, 10)));
      }
    }

    constraints.push(orderBy(orderByField, orderDirection));

    if (limit) {
      constraints.push(limitQuery(limit));
    }

    const q = query(testimonialsRef, ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const records: Testimonial[] = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data();
          return {
            id: docSnapshot.id,
            userId: data.userId,
            displayName: data.displayName ?? 'Member',
            quote: data.quote ?? '',
            rating: typeof data.rating === 'number' ? data.rating : 5,
            status: (data.status ?? 'pending') as TestimonialStatus,
            featured: Boolean(data.featured),
            highlight: data.highlight ?? undefined,
            avatarUrl: data.avatarUrl ?? undefined,
            createdAt: data.createdAt?.toDate?.() ?? new Date(),
            updatedAt: data.updatedAt?.toDate?.() ?? undefined,
            reviewedBy: data.reviewedBy ?? undefined,
            reviewedAt: data.reviewedAt?.toDate?.() ?? undefined,
            publishedAt: data.publishedAt?.toDate?.() ?? undefined,
          };
        });

        if (prioritizeFeatured) {
          const getOrderValue = (item: Testimonial) => {
            const value = item[orderByField];
            return value instanceof Date ? value.getTime() : 0;
          };

          records.sort((a, b) => {
            if (a.featured === b.featured) {
              return getOrderValue(b) - getOrderValue(a);
            }
            return a.featured ? -1 : 1;
          });
        }

        setTestimonials(records);
        setLoading(false);
      },
      (err) => {
        console.error('[useTestimonials] Failed to load testimonials', err);
        setError(err);
        setTestimonials([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [constraintsKey, prioritizeFeatured]);

  return { testimonials, loading, error };
}
