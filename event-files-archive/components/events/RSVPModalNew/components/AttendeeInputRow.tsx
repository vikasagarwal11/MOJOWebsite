import { memo } from 'react';

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
    <div className="space-y-2">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
        <input
          type="text"
          placeholder="Enter name"
          value={member.name}
          onChange={(e) => onUpdate(member.id, 'name', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129] bg-white"
        />
      </div>
      
      {/* Age Group and Relationship in a row */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Age</label>
          <select
            value={member.ageGroup}
            onChange={(e) => onUpdate(member.id, 'ageGroup', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129] bg-white"
          >
            <option value="0-2">0-2 yrs</option>
            <option value="3-5">3-5 yrs</option>
            <option value="6-10">6-10 yrs</option>
            <option value="11+">Teen</option>
            <option value="adult">Adult</option>
          </select>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Relation</label>
          <select
            value={member.relationship}
            onChange={(e) => onUpdate(member.id, 'relationship', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129] bg-white"
          >
            <option value="spouse">Spouse</option>
            <option value="child">Child</option>
            <option value="guest">Guest</option>
          </select>
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onRemove(member.id)}
          className="flex-1 px-3 py-2 bg-red-500 text-white text-sm rounded-lg active:bg-red-600 transition-colors font-medium touch-manipulation"
          title="Remove"
        >
          Remove
        </button>
        <button
          onClick={onAdd}
          className="flex-1 px-3 py-2 bg-green-500 text-white text-sm rounded-lg active:bg-green-600 transition-colors font-medium touch-manipulation"
          title="Add Another"
        >
          Add Row
        </button>
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
