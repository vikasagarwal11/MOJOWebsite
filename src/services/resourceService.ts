import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { stripUndefined } from '../utils/firestore';
import type { CreateResourceEntryData, ResourceCategory } from '../types/resources';

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export async function createResourceEntry(
  data: CreateResourceEntryData,
  contributorId: string,
  contributorName: string,
  contributorPhoto?: string
): Promise<string> {
  const categoryRef = doc(db, 'resourceCategories', data.categoryId);
  const categorySnap = await getDoc(categoryRef);

  if (!categorySnap.exists()) {
    throw new Error('Category not found');
  }

  const category = categorySnap.data() as ResourceCategory;
  let subcategory: ResourceCategory | null = null;

  if (data.subcategoryId) {
    const subRef = doc(db, 'resourceCategories', data.subcategoryId);
    const subSnap = await getDoc(subRef);
    if (subSnap.exists()) {
      subcategory = subSnap.data() as ResourceCategory;
    }
  }

  const entryData = stripUndefined({
    title: data.title.trim(),
    description: data.description.trim(),
    categoryId: data.categoryId,
    categoryName: category.name,
    categorySlug: category.slug,
    subcategoryId: subcategory ? data.subcategoryId : null,
    subcategoryName: subcategory?.name ?? null,
    subcategorySlug: subcategory?.slug ?? null,
    location: data.location?.trim() || undefined,
    contact: data.contact?.trim() || undefined,
    website: data.website?.trim() || undefined,
    contributorId,
    contributorName,
    contributorPhoto,
    tags: data.tags || [],
    schedule: data.schedule,
    isPublic: category.allowPublicRead ?? true,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const docRef = await addDoc(collection(db, 'resources'), entryData);
  return docRef.id;
}

export async function updateResourceEntry(
  entryId: string,
  data: CreateResourceEntryData
): Promise<void> {
  const categoryRef = doc(db, 'resourceCategories', data.categoryId);
  const categorySnap = await getDoc(categoryRef);

  if (!categorySnap.exists()) {
    throw new Error('Category not found');
  }

  const category = categorySnap.data() as ResourceCategory;
  let subcategory: ResourceCategory | null = null;

  if (data.subcategoryId) {
    const subRef = doc(db, 'resourceCategories', data.subcategoryId);
    const subSnap = await getDoc(subRef);
    if (subSnap.exists()) {
      subcategory = subSnap.data() as ResourceCategory;
    }
  }

  const updateData = stripUndefined({
    title: data.title.trim(),
    description: data.description.trim(),
    categoryId: data.categoryId,
    categoryName: category.name,
    categorySlug: category.slug,
    subcategoryId: subcategory ? data.subcategoryId : null,
    subcategoryName: subcategory?.name ?? null,
    subcategorySlug: subcategory?.slug ?? null,
    location: data.location?.trim() || undefined,
    contact: data.contact?.trim() || undefined,
    website: data.website?.trim() || undefined,
    tags: data.tags || [],
    schedule: data.schedule,
    isPublic: category.allowPublicRead ?? true,
    updatedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'resources', entryId), updateData);
}

export async function softDeleteResourceEntry(entryId: string, deletedBy: string): Promise<void> {
  await updateDoc(doc(db, 'resources', entryId), {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy,
    updatedAt: serverTimestamp(),
  });
}
