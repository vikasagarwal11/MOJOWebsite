import { motion } from "framer-motion";
import { Calendar, Clock, MapPin, Tag, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { EventDoc } from "../../hooks/useEvents";
import { safeFormat, safeToDate } from "../../utils/dateUtils";
import { EventImage } from "../events/EventImage";

type Props = {
  event: EventDoc;
  toDetails: string; // precomputed route (v2)
};

function formatDate(d: any) {
  return safeFormat(d, "EEE, MMM d", "Date TBD");
}

function formatTime(d: any) {
  return safeFormat(d, "h:mm a", "");
}

function getPriceLabel(event: EventDoc) {
  const pricing: any = (event as any).pricing;
  if (!pricing) return "Free";
  const requiresPayment = !!pricing.requiresPayment;
  const payThere = !!pricing.payThere;
  const adultPrice = pricing.adultPrice;
  const support = pricing.eventSupportAmount;

  // Pay There event - payment handled separately
  if (payThere) return "Pay There";

  // Paid event with price in cents
  if (requiresPayment && typeof adultPrice === "number" && adultPrice > 0) {
    return `$${(adultPrice / 100).toFixed(2)}`;
  }

  // Free, but has support amount (still show Free + support)
  if (!requiresPayment) return "Free";

  // Paid but missing amount
  if (requiresPayment) return "Paid";
  if (typeof support === "number" && support > 0) return "Free";
  return "Free";
}

export default function EventCardV2({ event, toDetails }: Props) {
  const navigate = useNavigate();
  const [showPayThereTooltip, setShowPayThereTooltip] = useState(false);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  const start = useMemo(() => safeToDate((event as any).startAt), [event]);
  const end = useMemo(() => safeToDate((event as any).endAt), [event]);

  const attending = typeof (event as any).attendingCount === "number" ? (event as any).attendingCount : 0;
  const max = typeof (event as any).maxAttendees === "number" ? (event as any).maxAttendees : undefined;

  const isPast = useMemo(() => {
    if (!start) return false;
    return start.getTime() < Date.now();
  }, [start]);

  const isFull = useMemo(() => {
    if (!max) return false;
    return attending >= max;
  }, [attending, max]);

  const priceLabel = getPriceLabel(event);
  const isPayThere = !!(event as any).pricing?.payThere;

  // Update tooltip position when shown
  useEffect(() => {
    if (showPayThereTooltip && badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.bottom + 8,
        left: rect.right - 256 // 256px = w-64
      });
    }
  }, [showPayThereTooltip]);

  const venueName = (event as any).venueName as string | undefined;
  const venueAddress = (event as any).venueAddress as string | undefined;
  const locationLabel = venueAddress || venueName || "Location TBD";

  return (
    <motion.button
      type="button"
      onClick={() => navigate(toDetails)}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.99 }}
      className="group w-full text-left bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition-all overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#F25129]/40"
    >
      {/* Image */}
      <div className="relative w-full h-44 sm:h-48 bg-gray-100">
        <EventImage
          src={(event as any).imageUrl}
          alt={(event as any).title}
          fit="cover"
          aspect="16/9"
          className="w-full h-full object-cover"
          title={(event as any).title}
        />

        {/* Status pill */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          {isPast ? (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-900/70 text-white backdrop-blur">
              Past
            </span>
          ) : isFull ? (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-600 text-white">
              Full
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-600 text-white">
              Open
            </span>
          )}
        </div>

        {/* Price pill */}
        <div className="absolute top-3 right-3">
          <span
            ref={badgeRef}
            className={`px-3 py-1 rounded-full text-xs font-semibold backdrop-blur border ${
              isPayThere 
                ? "bg-blue-600 text-white border-blue-700 cursor-help" 
                : "bg-white/90 text-gray-900 border-gray-200"
            }`}
            onMouseEnter={() => isPayThere && setShowPayThereTooltip(true)}
            onMouseLeave={() => isPayThere && setShowPayThereTooltip(false)}
            onClick={(e) => {
              if (isPayThere) {
                e.stopPropagation();
                setShowPayThereTooltip(!showPayThereTooltip);
              }
            }}
          >
            {priceLabel}
          </span>
          
          {/* Pay There Tooltip - Portal to body with fixed positioning */}
          {isPayThere && showPayThereTooltip && createPortal(
            <div 
              className="fixed w-64 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl z-[9999] pointer-events-none"
              style={{
                top: `${tooltipPosition.top}px`,
                left: `${tooltipPosition.left}px`
              }}
            >
              <div className="absolute -top-1 right-4 w-2 h-2 bg-gray-900 transform rotate-45"></div>
              <p className="leading-relaxed">
                RSVP now. Payment will be handled separately at the event or directly with the hosting organization.
              </p>
            </div>,
            document.body
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900 leading-snug line-clamp-2">
            {(event as any).title}
          </h3>
        </div>

        {(event as any).description ? (
          <p className="mt-2 text-sm text-gray-600 leading-5 line-clamp-2">
            {(event as any).description}
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-400 italic">Details coming soon.</p>
        )}

        {/* Meta row */}
        <div className="mt-4 space-y-2 text-sm text-gray-700">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#F25129]" />
            <span className="font-medium">{formatDate((event as any).startAt)}</span>
            {start && (
              <>
                <span className="text-gray-300">•</span>
                <Clock className="w-4 h-4 text-[#F25129]" />
                <span className="font-medium">{formatTime((event as any).startAt)}{end ? ` – ${formatTime((event as any).endAt)}` : ""}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#F25129]" />
            <span className="line-clamp-1">{locationLabel}</span>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-gray-700">
              <Users className="w-4 h-4 text-[#F25129]" />
              <span className="font-medium">
                {attending}{max ? ` / ${max}` : ""} going
              </span>
            </div>

            <div className="inline-flex items-center gap-2 text-[#F25129] font-semibold">
              <Tag className="w-4 h-4" />
              <span className="text-sm">View details</span>
            </div>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

