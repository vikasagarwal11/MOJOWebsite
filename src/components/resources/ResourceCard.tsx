import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';
import { Calendar, ExternalLink, MapPin, Phone, Tag, User, Edit2, Trash2 } from 'lucide-react';
import type { ResourceEntry } from '../../types/resources';

interface ResourceCardProps {
  entry: ResourceEntry;
  canEdit: boolean;
  onEdit: (entry: ResourceEntry) => void;
  onDelete: (entry: ResourceEntry) => void;
  categoryColor?: string;
  categoryIcon?: string;
  subcategoryColor?: string;
}

const ResourceCard: React.FC<ResourceCardProps> = ({
  entry,
  canEdit,
  onEdit,
  onDelete,
  categoryColor,
  categoryIcon,
  subcategoryColor,
}) => {
  const hasHtml = useMemo(() => /<\/?[a-z][\s\S]*>/i.test(entry.description || ''), [entry.description]);
  const safeHtml = useMemo(
    () => DOMPurify.sanitize(entry.description || ''),
    [entry.description]
  );

  const badgeStyle = (color?: string) =>
    color
      ? { backgroundColor: `${color}1A`, color }
      : undefined;

  return (
    <div className="border border-gray-200 rounded-2xl bg-white shadow-sm p-5 hover:shadow-md transition">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{entry.title}</h3>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 inline-flex items-center gap-1"
              style={badgeStyle(categoryColor)}
            >
              {categoryIcon ? <span>{categoryIcon}</span> : null}
              {entry.categoryName}
            </span>
            {entry.subcategoryName && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"
                style={badgeStyle(subcategoryColor)}
              >
                {entry.subcategoryName}
              </span>
            )}
          </div>

          <div className="mb-4">
            {hasHtml ? (
              <div
                className="resource-richtext"
                dangerouslySetInnerHTML={{ __html: safeHtml }}
              />
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                className="resource-markdown"
              >
                {entry.description}
              </ReactMarkdown>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
            {entry.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {entry.location}
              </span>
            )}
            {entry.contact && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-3 h-3" /> {entry.contact}
              </span>
            )}
            {entry.website && (
              <a
                href={entry.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#F25129] hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> Website
              </a>
            )}
            <span className="inline-flex items-center gap-1">
              <User className="w-3 h-3" /> {entry.contributorName}
            </span>
          </div>

          {entry.schedule && (
            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700">
              <div className="flex items-center gap-2 font-medium text-gray-800 mb-1">
                <Calendar className="w-4 h-4 text-[#F25129]" />
                Class Schedule
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                {entry.schedule.days && entry.schedule.days.length > 0 && (
                  <span>Days: {entry.schedule.days.join(', ')}</span>
                )}
                {entry.schedule.time && <span>Time: {entry.schedule.time}</span>}
                {entry.schedule.instructor && <span>Instructor: {entry.schedule.instructor}</span>}
              </div>
              {entry.schedule.notes && (
                <p className="text-xs text-gray-600 mt-2">{entry.schedule.notes}</p>
              )}
            </div>
          )}

          {entry.tags && entry.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-4 text-xs text-gray-500">
              <Tag className="w-3 h-3" />
              {entry.tags.map(tag => (
                <span key={tag} className="inline-flex px-2 py-0.5 bg-gray-100 rounded-full text-gray-700">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEdit(entry)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-full border border-gray-200 text-sm text-gray-700 hover:bg-gray-100 transition"
            >
              <Edit2 className="w-4 h-4" /> Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(entry)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-full border border-red-200 text-sm text-red-600 hover:bg-red-50 transition"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResourceCard;
