import React from 'react';
import { Camera, X as IconX } from 'lucide-react';

type Address = {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};
type SocialLinks = {
  instagram?: string;
  facebook?: string;
  twitter?: string;
  tiktok?: string;
  youtube?: string;
  website?: string;
};

type ProfilePersonalTabProps = {
  firstName: string;
  setFirstName: (value: string) => void;
  lastName: string;
  setLastName: (value: string) => void;
  displayName: string;
  setDisplayName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  photoURL: string | undefined;
  about: string;
  setAbout: (value: string) => void;
  address: Address;
  setAddress: (value: Address) => void;
  zipStatus: 'idle' | 'loading' | 'ok' | 'error';
  interests: string[];
  tagInput: string;
  setTagInput: (value: string) => void;
  social: SocialLinks;
  setSocial: (value: SocialLinks) => void;
  saving: boolean;
  uploading: boolean;
  cityOptions: string[];
  onUploadAvatar: (file: File) => Promise<void>;
  lookupZip: (zip: string) => Promise<void>;
  addTag: (raw: string) => void;
  removeTag: (t: string) => void;
  onTagKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  onSave: () => Promise<void>;
  initialsForAvatar: string;
};

export const ProfilePersonalTab: React.FC<ProfilePersonalTabProps> = ({
  firstName,
  setFirstName,
  lastName,
  setLastName,
  displayName,
  setDisplayName,
  email,
  setEmail,
  photoURL,
  about,
  setAbout,
  address,
  setAddress,
  zipStatus,
  interests,
  tagInput,
  setTagInput,
  social,
  setSocial,
  saving,
  uploading,
  cityOptions,
  onUploadAvatar,
  lookupZip,
  addTag,
  removeTag,
  onTagKeyDown,
  onSave,
  initialsForAvatar,
}) => (
  <div className="grid gap-6">
    <div className="flex items-center gap-6 mb-8">
      <div className="relative">
        <div className="w-24 h-24 rounded-full overflow-hidden border bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
          {photoURL ? (
            <img src={photoURL} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl font-bold">{initialsForAvatar}</span>
          )}
        </div>
        <label className="absolute -bottom-2 -right-2 bg-purple-600 text-white p-2 rounded-full cursor-pointer hover:bg-purple-700">
          <Camera className="w-4 h-4" />
          <input
            type="file"
            className="hidden"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && onUploadAvatar(e.target.files[0])}
            disabled={uploading}
          />
        </label>
      </div>
      <div>
        <div className="text-sm text-gray-500">Role</div>
        <div className="inline-flex items-center gap-2 mt-1">
          <span className="px-2 py-1 rounded-full text-xs font-medium border">{displayName || 'Member'}</span>
        </div>
        {!!email && (
          <div className="mt-2 text-sm text-gray-600">Auth email: {email}</div>
        )}
      </div>
    </div>
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">First name</label>
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          placeholder="First name"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Last name</label>
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          placeholder="Last name"
        />
      </div>
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Email (optional)</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        placeholder="you@example.com"
      />
      <p className="mt-1 text-xs text-gray-500">
        Used for notifications and profile; phone sign-in remains your login method.
      </p>
    </div>
    <div className="grid gap-4">
      <h2 className="text-sm font-semibold text-gray-700">Address (optional)</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Street</label>
          <input
            value={address.street || ''}
            onChange={(e) => setAddress(a => ({ ...a, street: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="123 Main St"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">ZIP code</label>
          <input
            value={address.postalCode || ''}
            onChange={(e) => {
              const zip = e.target.value.replace(/\D/g, '').slice(0, 5);
              setAddress(a => ({ ...a, postalCode: zip }));
              if (zip.length === 5) lookupZip(zip);
              else setZipStatus('idle');
            }}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="07078"
            inputMode="numeric"
            maxLength={5}
          />
          <div className="h-5 text-xs mt-1">
            {zipStatus === 'loading' && <span className="text-gray-500">Looking up ZIP…</span>}
            {zipStatus === 'ok' && <span className="text-green-600">Matched city & state.</span>}
            {zipStatus === 'error' && <span className="text-red-600">ZIP not found.</span>}
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
          <input
            list="nj-cities"
            value={address.city || ''}
            onChange={(e) => setAddress(a => ({ ...a, city: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Short Hills"
          />
          <datalist id="nj-cities">
            {cityOptions.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
          <input
            value={address.state || 'NJ'}
            onChange={(e) => setAddress(a => ({ ...a, state: e.target.value.toUpperCase() }))}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="NJ"
            maxLength={2}
          />
        </div>
      </div>
      <p className="text-xs text-gray-500">
        If you add an address, <span className="font-medium">City and State are required</span>.
      </p>
    </div>
    <div className="grid gap-2">
      <h2 className="text-sm font-semibold text-gray-700">About (optional)</h2>
      <textarea
        value={about}
        onChange={(e) => setAbout(e.target.value)}
        maxLength={1000}
        rows={4}
        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        placeholder="A short bio for your profile… (max 1000 chars)"
      />
      <div className="text-xs text-gray-500">{about.length}/1000</div>
    </div>
    <div className="grid gap-4">
      <h2 className="text-sm font-semibold text-gray-700">Social links (optional)</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <input
          placeholder="Instagram URL"
          value={social.instagram || ''}
          onChange={(e) => setSocial(s => ({ ...s, instagram: e.target.value }))}
          className="px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
        <input
          placeholder="Facebook URL"
          value={social.facebook || ''}
          onChange={(e) => setSocial(s => ({ ...s, facebook: e.target.value }))}
          className="px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
        <input
          placeholder="Twitter/X URL"
          value={social.twitter || ''}
          onChange={(e) => setSocial(s => ({ ...s, twitter: e.target.value }))}
          className="px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
        <input
          placeholder="TikTok URL"
          value={social.tiktok || ''}
          onChange={(e) => setSocial(s => ({ ...s, tiktok: e.target.value }))}
          className="px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
        <input
          placeholder="YouTube URL"
          value={social.youtube || ''}
          onChange={(e) => setSocial(s => ({ ...s, youtube: e.target.value }))}
          className="px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
        <input
          placeholder="Website URL"
          value={social.website || ''}
          onChange={(e) => setSocial(s => ({ ...s, website: e.target.value }))}
          className="px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>
    </div>
    <div className="grid gap-2">
      <h2 className="text-sm font-semibold text-gray-700">Interests</h2>
      <div className="flex flex-wrap gap-2">
        {interests.map(t => (
          <span
            key={t}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-purple-100 text-purple-700"
          >
            {t}
            <button
              type="button"
              onClick={() => removeTag(t)}
              className="hover:text-purple-900"
              aria-label={`Remove ${t}`}
            >
              <IconX className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={onTagKeyDown}
        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        placeholder="Type an interest (e.g., yoga) and press Enter"
      />
      <p className="text-xs text-gray-500">We'll save them like <code>#yoga</code>, <code>#pilates</code>.</p>
    </div>
    <div className="flex items-center justify-end">
      <button
        onClick={onSave}
        disabled={saving}
        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-full hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  </div>
);