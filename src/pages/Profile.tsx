import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '../config/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Camera, X as IconX } from 'lucide-react';
import toast from 'react-hot-toast';
import { NJ_CITIES } from '../data/nj-cities';

type Address = {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

type SocialLinks = {
  instagram?: string;
  facebook?: string;
  twitter?: string;   // still calling it "twitter" in the field name
  tiktok?: string;
  youtube?: string;
  website?: string;
};

function normalizeTag(input: string): string | null {
  let t = (input || '').trim();
  if (!t) return null;
  if (!t.startsWith('#')) t = `#${t}`;
  t = t.toLowerCase().replace(/\s+/g, '-').replace(/[^#a-z0-9_-]/g, '');
  return t.length > 1 ? t : null;
}

const Profile: React.FC = () => {
  const { currentUser } = useAuth();

  // Core profile
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [photoURL, setPhotoURL] = useState<string | undefined>(undefined);
  const [about, setAbout] = useState(''); // NEW

  // Address + lookup
  const [address, setAddress] = useState<Address>({ state: '' });

  const [zipStatus, setZipStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const zipAbortRef = useRef<AbortController | null>(null);

  // Interests
  const [interests, setInterests] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Social
  const [social, setSocial] = useState<SocialLinks>({});

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Load from Auth + Firestore
  useEffect(() => {
    if (!currentUser) return;

    setDisplayName(currentUser.displayName || '');
    setEmail(currentUser.email || '');
    setPhotoURL(currentUser.photoURL);

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', currentUser.id));
        if (snap.exists()) {
          const d = snap.data() as any;

          setFirstName(d.firstName || '');
          setLastName(d.lastName || '');
          setDisplayName(d.displayName || currentUser.displayName || '');
          setEmail(d.email || currentUser.email || '');
          setPhotoURL(d.photoURL || currentUser.photoURL);
          setAbout(d.about || ''); // NEW

          setAddress({
            street: d.address?.street || '',
            city: d.address?.city || '',
            state: d.address?.state || '',
            postalCode: d.address?.postalCode || '',
          });

          setInterests(Array.isArray(d.interests) ? d.interests : []);
          setSocial({
            instagram: d.social?.instagram || '',
            facebook:  d.social?.facebook  || '',
            twitter:   d.social?.twitter   || '',
            tiktok:    d.social?.tiktok    || '',
            youtube:   d.social?.youtube   || '',
            website:   d.social?.website   || '',
          });
        }
      } catch {
        // ignore snapshot errors
      }
    })();
  }, [currentUser]);

  const isAuthed = !!currentUser;

  const initialsForAvatar = useMemo(() => {
    const name = displayName || [firstName, lastName].filter(Boolean).join(' ') || 'Member';
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]?.toUpperCase() || '').join('') || 'MM';
  }, [displayName, firstName, lastName]);

  if (!isAuthed) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="rounded-xl border bg-white p-8">
          <h1 className="text-2xl font-semibold">Profile</h1>
          <p className="mt-4 text-gray-600">Please sign in to view your profile.</p>
        </div>
      </div>
    );
  }

  // ---------- Avatar upload ----------
  const onUploadAvatar = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (JPEG/PNG/WebP).');
      return;
    }

    // Fast local preview
    const tempUrl = URL.createObjectURL(file);
    setPhotoURL(tempUrl);

    try {
      setUploading(true);

      const ext =
        file.type === 'image/png'  ? 'png'  :
        file.type === 'image/webp' ? 'webp' :
        file.type === 'image/gif'  ? 'gif'  : 'jpg';

      const ts = Date.now();
      const avatarRef = ref(storage, `profiles/${currentUser!.id}/avatar_${ts}.${ext}`);

      await uploadBytes(avatarRef, file, {
        contentType: file.type,
        cacheControl: 'public, max-age=3600',
      });

      const url = await getDownloadURL(avatarRef);

      URL.revokeObjectURL(tempUrl);
      setPhotoURL(url);

      await updateDoc(doc(db, 'users', currentUser!.id), {
        photoURL: url,
        avatarUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success('Profile photo updated');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  // ---------- ZIP → City/State lookup ----------
  const lookupZip = async (zip: string) => {
    if (!/^\d{5}$/.test(zip)) return;

    zipAbortRef.current?.abort();
    const ctrl = new AbortController();
    zipAbortRef.current = ctrl;

    setZipStatus('loading');
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${zip}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error('not found');
      const data = await res.json();
      const place = data?.places?.[0];
      const city = place?.['place name'] || '';
      const state = place?.['state abbreviation'] || '';

      if (city && state) {
        setAddress(a => ({ ...a, city, state }));
        setZipStatus('ok');
      } else {
        setZipStatus('error');
      }
    } catch {
      setZipStatus('error');
    }
  };

  // ---------- Interests ----------
  const addTag = (raw: string) => {
    const t = normalizeTag(raw);
    if (!t) return;
    if (interests.includes(t)) return;
    setInterests(prev => [...prev, t]);
  };
  const removeTag = (t: string) => setInterests(prev => prev.filter(x => x !== t));
  const onTagKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
      setTagInput('');
    }
  };

  // ---------- Save ----------
  const onSave = async () => {
    const hasAnyAddress =
      !!address.street || !!address.city || !!address.state || !!address.postalCode;

    if (hasAnyAddress && (!address.city || !address.state)) {
      toast.error('If you add an address, City and State are required.');
      return;
    }

    const computedDisplay = [firstName, lastName].filter(Boolean).join(' ') || displayName || 'Member';

    try {
      setSaving(true);
      await updateDoc(doc(db, 'users', currentUser!.id), {
        firstName: firstName || '',
        lastName:  lastName  || '',
        displayName: computedDisplay,
        email: email || '',
        address: hasAnyAddress
          ? {
              street: address.street || '',
              city: address.city || '',
              state: address.state || 'NJ',
              postalCode: address.postalCode || '',
            }
          : {},
        social,
        interests,
        about: (about || '').trim(),
        updatedAt: serverTimestamp(),
      });
      setDisplayName(computedDisplay);
      toast.success('Profile saved');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const cityOptions = useMemo(() => NJ_CITIES, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold mb-6">My Profile</h1>

        {/* Header row: avatar + role/email */}
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
              <span className="px-2 py-1 rounded-full text-xs font-medium border">
                {currentUser!.role}
              </span>
            </div>
            {!!currentUser!.email && (
              <div className="mt-2 text-sm text-gray-600">Auth email: {currentUser!.email}</div>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="grid gap-6">
          {/* First / Last & Email */}
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

          {/* Address */}
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

          {/* About */}
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

          {/* Social links */}
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

          {/* Interests */}
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
            <p className="text-xs text-gray-500">We’ll save them like <code>#yoga</code>, <code>#pilates</code>.</p>
          </div>

          {/* Save */}
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
      </div>
    </div>
  );
};

export default Profile;
