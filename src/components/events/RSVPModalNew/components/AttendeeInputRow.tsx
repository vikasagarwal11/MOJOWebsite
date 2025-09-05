import React, { memo } from 'react';
import { Trash2, UserPlus } from 'lucide-react';

interface BulkRow {
  id: string;
  name: string;
  ageGroup: string;
  relationship: string;
  rsvpStatus: string;
}

interface AttendeeInputRowProps {
  member: BulkRow;
  onUpdate: (id: string, field: keyof BulkRow, value: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}

export const AttendeeInputRow = memo<AttendeeInputRowProps>(({ 
  member, 
  onUpdate, 
  onRemove, 
  onAdd 
}) => {
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      {/* Name - 4 columns */}
      <div className="col-span-4">
        <input
          type="text"
          placeholder="Name"
          value={member.name}
          onChange={(e) => onUpdate(member.id, 'name', e.target.value)}
          className="w-full px-1.5 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-[#F25129] focus:border-[#F25129] bg-white"
        />
      </div>
      
      {/* Age Group - 3 columns */}
      <div className="col-span-3">
        <select
          value={member.ageGroup}
          onChange={(e) => onUpdate(member.id, 'ageGroup', e.target.value)}
          className="w-full px-1.5 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-[#F25129] focus:border-[#F25129] bg-white"
        >
          <option value="0-2">0-2</option>
          <option value="3-5">3-5</option>
          <option value="6-10">6-10</option>
          <option value="11+">Teen</option>
          <option value="adult">Adult</option>
        </select>
      </div>
      
      {/* Relationship - 3 columns */}
      <div className="col-span-3">
        <select
          value={member.relationship}
          onChange={(e) => onUpdate(member.id, 'relationship', e.target.value)}
          className="w-full px-1.5 py-0.5 text-[11px] border border-gray-300 rounded focus:ring-1 focus:ring-[#F25129] focus:border-[#F25129] bg-white"
        >
          <option value="spouse">Spouse</option>
          <option value="child">Child</option>
          <option value="guest">Guest</option>
        </select>
      </div>
      
      {/* Actions - 2 columns */}
      <div className="col-span-2">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => onRemove(member.id)}
            className="px-1 py-0.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors flex items-center justify-center"
            title="Remove row"
          >
            <Trash2 className="w-3 h-3" />
          </button>
          <button
            onClick={onAdd}
            className="px-1 py-0.5 bg-green-500 text-white rounded hover:bg-green-600 transition-colors flex items-center justify-center"
            title="Add row"
          >
            <UserPlus className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
});

AttendeeInputRow.displayName = 'AttendeeInputRow';

// Custom comparison function to prevent unnecessary re-renders
const areEqual = (prevProps: AttendeeInputRowProps, nextProps: AttendeeInputRowProps) => {
  return (
    prevProps.member.id === nextProps.member.id &&
    prevProps.member.name === nextProps.member.name &&
    prevProps.member.ageGroup === nextProps.member.ageGroup &&
    prevProps.member.relationship === nextProps.member.relationship &&
    prevProps.member.rsvpStatus === nextProps.member.rsvpStatus &&
    prevProps.onUpdate === nextProps.onUpdate &&
    prevProps.onRemove === nextProps.onRemove &&
    prevProps.onAdd === nextProps.onAdd
  );
};

export const AttendeeInputRowMemo = memo(AttendeeInputRow, areEqual);
