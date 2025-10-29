import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { CheckCircle, Eye, Loader2, Star, Trash2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useTestimonials } from '../hooks/useTestimonials';
import { adminUpdateTestimonial, deleteTestimonial } from '../services/testimonialsService';
import type { Testimonial, TestimonialStatus } from '../types';

const statusLabels: Record<TestimonialStatus, { label: string; className: string }> = {
  pending: { label: 'Pending Review', className: 'bg-amber-100 text-amber-700' },
  published: { label: 'Published', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejected', className: 'bg-gray-200 text-gray-600' },
};

const AdminTestimonials: React.FC = () => {
  const { currentUser } = useAuth();
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<TestimonialStatus | 'all'>('pending');

  const { testimonials, loading, error } = useTestimonials({
    statuses: ['pending', 'published', 'rejected'],
    orderByField: 'updatedAt',
    orderDirection: 'desc',
    prioritizeFeatured: false,
  });

  const filteredTestimonials = useMemo(() => {
    if (selectedStatusFilter === 'all') {
      return testimonials;
    }
    return testimonials.filter((testimonial) => testimonial.status === selectedStatusFilter);
  }, [selectedStatusFilter, testimonials]);

  const handleStatusChange = async (testimonial: Testimonial, nextStatus: TestimonialStatus) => {
    if (!currentUser) return;
    const isPublishing = nextStatus === 'published';

    try {
      await adminUpdateTestimonial(testimonial.id, {
        status: nextStatus,
        reviewerId: currentUser.id,
      });

      toast.success(
        isPublishing ? 'Testimonial published successfully.' : nextStatus === 'pending' ? 'Testimonial moved back to pending.' : 'Testimonial was rejected.'
      );
    } catch (err: any) {
      console.error('[AdminTestimonials] Failed to update testimonial status', err);
      toast.error(err?.message ?? 'Unable to update testimonial.');
    }
  };

  const handleToggleFeatured = async (testimonial: Testimonial) => {
    try {
      await adminUpdateTestimonial(testimonial.id, {
        featured: !testimonial.featured,
      });
      toast.success(testimonial.featured ? 'Removed from featured.' : 'Marked as featured.');
    } catch (err: any) {
      console.error('[AdminTestimonials] Failed to toggle featured', err);
      toast.error(err?.message ?? 'Unable to update featured state.');
    }
  };

  const handleDelete = async (testimonial: Testimonial) => {
    const confirm = window.confirm('Delete this testimonial permanently? This action cannot be undone.');
    if (!confirm) return;

    try {
      await deleteTestimonial(testimonial.id);
      toast.success('Testimonial deleted.');
    } catch (err: any) {
      console.error('[AdminTestimonials] Failed to delete testimonial', err);
      toast.error(err?.message ?? 'Unable to delete testimonial.');
    }
  };

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-600">
        Admin access required to view testimonials moderation.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Helmet>
        <title>Admin · Testimonials Moderation</title>
      </Helmet>

      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Testimonials moderation</h1>
          <p className="text-sm text-gray-600">
            Review and manage stories shared by the moms community. Publish to show on the homepage carousel.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['pending', 'published', 'rejected', 'all'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setSelectedStatusFilter(status === 'all' ? 'all' : status)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                selectedStatusFilter === status
                  ? 'bg-[#F25129] text-white shadow'
                  : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
              }`}
            >
              {status === 'all'
                ? 'All'
                : statusLabels[status].label}
            </button>
          ))}
        </div>
      </header>

      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-[#F25129]/30 bg-white/80 p-6 text-[#F25129]">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading testimonials…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          Failed to load testimonials. Please refresh the page.
        </div>
      )}

      {!loading && !error && filteredTestimonials.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#F25129]/30 bg-white/80 p-6 text-center text-gray-600">
          No testimonials found for this filter.
        </div>
      )}

      <div className="space-y-4">
        {filteredTestimonials.map((testimonial) => {
          const statusMeta = statusLabels[testimonial.status];
          return (
            <article
              key={testimonial.id}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-lg"
            >
              <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[#FFC107]">
                    {Array.from({ length: Math.round(testimonial.rating || 0) }).map((_, index) => (
                      <Star key={index} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <h2 className="mt-1 text-xl font-semibold text-gray-900">{testimonial.displayName}</h2>
                  {testimonial.highlight && (
                    <p className="text-sm text-[#F25129]">{testimonial.highlight}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                  {testimonial.featured && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Featured
                    </span>
                  )}
                </div>
              </header>

              <p className="mt-4 text-gray-700">“{testimonial.quote}”</p>

              <footer className="mt-6 flex flex-col gap-3 border-t border-dashed border-gray-200 pt-4 md:flex-row md:items-center md:justify-between">
                <div className="text-xs text-gray-500">
                  <span>Submitted: {testimonial.createdAt.toLocaleDateString()}</span>
                  {testimonial.updatedAt && <span className="ml-3">Updated: {testimonial.updatedAt.toLocaleDateString()}</span>}
                </div>

                <div className="flex flex-wrap gap-2">
                  {testimonial.status !== 'published' && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(testimonial, 'published')}
                      className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
                    >
                      <CheckCircle className="h-4 w-4" /> Publish
                    </button>
                  )}

                  {testimonial.status === 'published' && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(testimonial, 'pending')}
                      className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-200"
                    >
                      <Eye className="h-4 w-4" /> Move to pending
                    </button>
                  )}

                  {testimonial.status !== 'rejected' && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(testimonial, 'rejected')}
                      className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-200"
                    >
                      <XCircle className="h-4 w-4" /> Reject
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleToggleFeatured(testimonial)}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                      testimonial.featured
                        ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                        : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Star className="h-4 w-4" /> {testimonial.featured ? 'Unfeature' : 'Feature'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(testimonial)}
                    className="inline-flex items-center gap-2 rounded-full bg-red-100 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-200"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                </div>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
};

export default AdminTestimonials;