import { Kysely } from 'kysely';
import type { Database, ImgsTable, VidsTable, DocsTable } from '../main/database.types';

export interface MediaImage {
  imghash: string;
  imgnam: string;
  imgnamo: string;
  imgloc: string;
  imgloco: string;
  locid: string | null;
  subid: string | null;
  auth_imp: string | null;
  imgadd: string | null;
  meta_exiftool: string | null;
  meta_width: number | null;
  meta_height: number | null;
  meta_date_taken: string | null;
  meta_camera_make: string | null;
  meta_camera_model: string | null;
  meta_gps_lat: number | null;
  meta_gps_lng: number | null;
  // Thumbnail/Preview fields (Migration 8 & 9 - Premium Archive)
  thumb_path: string | null;
  thumb_path_sm: string | null;
  thumb_path_lg: string | null;
  preview_path: string | null;
  preview_extracted: number;
  xmp_synced: number;
  xmp_modified_at: string | null;
  // Hidden/Live Photo fields (Migration 23)
  hidden: number;
  hidden_reason: string | null;
  is_live_photo: number;
  // Activity Tracking (Migration 25)
  imported_by_id: string | null;
  imported_by: string | null;
  media_source: string | null;
  // OPT-047: File size for archive size tracking
  file_size_bytes: number | null;
  // NOTE: darktable columns exist in DB but are deprecated/unused
}

export interface MediaVideo {
  vidhash: string;
  vidnam: string;
  vidnamo: string;
  vidloc: string;
  vidloco: string;
  locid: string | null;
  subid: string | null;
  auth_imp: string | null;
  vidadd: string | null;
  meta_ffmpeg: string | null;
  meta_exiftool: string | null;
  meta_duration: number | null;
  meta_width: number | null;
  meta_height: number | null;
  meta_codec: string | null;
  meta_fps: number | null;
  meta_date_taken: string | null;
  // GPS fields (FIX 3.2 - dashcams, phones)
  meta_gps_lat: number | null;
  meta_gps_lng: number | null;
  // Thumbnail/Poster fields (Migration 8 & 9 - Premium Archive)
  thumb_path: string | null;
  thumb_path_sm: string | null;
  thumb_path_lg: string | null;
  preview_path: string | null;
  poster_extracted: number;
  xmp_synced: number;
  xmp_modified_at: string | null;
  // Hidden/Live Photo fields (Migration 23)
  hidden: number;
  hidden_reason: string | null;
  is_live_photo: number;
  // Activity Tracking (Migration 25)
  imported_by_id: string | null;
  imported_by: string | null;
  media_source: string | null;
  // OPT-047: File size for archive size tracking
  file_size_bytes: number | null;
}

export interface MediaDocument {
  dochash: string;
  docnam: string;
  docnamo: string;
  docloc: string;
  docloco: string;
  locid: string | null;
  subid: string | null;
  auth_imp: string | null;
  docadd: string | null;
  meta_exiftool: string | null;
  meta_page_count: number | null;
  meta_author: string | null;
  meta_title: string | null;
  // Hidden fields (Migration 23)
  hidden: number;
  hidden_reason: string | null;
  // Activity Tracking (Migration 25)
  imported_by_id: string | null;
  imported_by: string | null;
  media_source: string | null;
  // OPT-047: File size for archive size tracking
  file_size_bytes: number | null;
}

/**
 * Repository for media files (images, videos, documents)
 */
export class SQLiteMediaRepository {
  constructor(private readonly db: Kysely<Database>) {}

  // ==================== IMAGES ====================

  async createImage(image: Omit<ImgsTable, 'imgadd'>): Promise<MediaImage> {
    const imgadd = new Date().toISOString();
    await this.db
      .insertInto('imgs')
      .values({ ...image, imgadd })
      .execute();
    return this.findImageByHash(image.imghash);
  }

  async findImageByHash(imghash: string): Promise<MediaImage> {
    const row = await this.db
      .selectFrom('imgs')
      .selectAll()
      .where('imghash', '=', imghash)
      .executeTakeFirstOrThrow();
    return row;
  }

  async findImagesByLocation(locid: string): Promise<MediaImage[]> {
    const rows = await this.db
      .selectFrom('imgs')
      .selectAll()
      .where('locid', '=', locid)
      .orderBy('imgadd', 'desc')
      .execute();
    return rows;
  }

  /**
   * OPT-037: Find images by location with pagination
   * For infinite scroll / lazy loading in galleries
   */
  async findImagesByLocationPaginated(locid: string, limit: number, offset: number): Promise<{
    images: MediaImage[];
    total: number;
    hasMore: boolean;
  }> {
    const [rows, countResult] = await Promise.all([
      this.db
        .selectFrom('imgs')
        .selectAll()
        .where('locid', '=', locid)
        .orderBy('imgadd', 'desc')
        .limit(limit)
        .offset(offset)
        .execute(),
      this.db
        .selectFrom('imgs')
        .select((eb) => eb.fn.countAll().as('count'))
        .where('locid', '=', locid)
        .executeTakeFirst(),
    ]);

    const total = Number(countResult?.count || 0);
    return {
      images: rows,
      total,
      hasMore: offset + rows.length < total,
    };
  }

  async imageExists(imghash: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('imgs')
      .select('imghash')
      .where('imghash', '=', imghash)
      .executeTakeFirst();
    return !!result;
  }

  // ==================== VIDEOS ====================

  async createVideo(video: Omit<VidsTable, 'vidadd'>): Promise<MediaVideo> {
    const vidadd = new Date().toISOString();
    await this.db
      .insertInto('vids')
      .values({ ...video, vidadd })
      .execute();
    return this.findVideoByHash(video.vidhash);
  }

  async findVideoByHash(vidhash: string): Promise<MediaVideo> {
    const row = await this.db
      .selectFrom('vids')
      .selectAll()
      .where('vidhash', '=', vidhash)
      .executeTakeFirstOrThrow();
    return row;
  }

  async findVideosByLocation(locid: string): Promise<MediaVideo[]> {
    const rows = await this.db
      .selectFrom('vids')
      .selectAll()
      .where('locid', '=', locid)
      .orderBy('vidadd', 'desc')
      .execute();
    return rows;
  }

  async videoExists(vidhash: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('vids')
      .select('vidhash')
      .where('vidhash', '=', vidhash)
      .executeTakeFirst();
    return !!result;
  }

  // ==================== DOCUMENTS ====================

  async createDocument(doc: Omit<DocsTable, 'docadd'>): Promise<MediaDocument> {
    const docadd = new Date().toISOString();
    await this.db
      .insertInto('docs')
      .values({ ...doc, docadd })
      .execute();
    return this.findDocumentByHash(doc.dochash);
  }

  async findDocumentByHash(dochash: string): Promise<MediaDocument> {
    const row = await this.db
      .selectFrom('docs')
      .selectAll()
      .where('dochash', '=', dochash)
      .executeTakeFirstOrThrow();
    return row;
  }

  async findDocumentsByLocation(locid: string): Promise<MediaDocument[]> {
    const rows = await this.db
      .selectFrom('docs')
      .selectAll()
      .where('locid', '=', locid)
      .orderBy('docadd', 'desc')
      .execute();
    return rows;
  }

  async documentExists(dochash: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('docs')
      .select('dochash')
      .where('dochash', '=', dochash)
      .executeTakeFirst();
    return !!result;
  }

  // ==================== GENERAL ====================

  async findAllMediaByLocation(locid: string): Promise<{
    images: MediaImage[];
    videos: MediaVideo[];
    documents: MediaDocument[];
  }> {
    const [images, videos, documents] = await Promise.all([
      this.findImagesByLocation(locid),
      this.findVideosByLocation(locid),
      this.findDocumentsByLocation(locid),
    ]);

    return { images, videos, documents };
  }

  // ==================== THUMBNAIL/PREVIEW OPERATIONS ====================

  /**
   * Get images without multi-tier thumbnails for batch generation
   * Kanye8 FIX: Check thumb_path_sm (400px) not thumb_path (legacy 256px)
   * This catches images imported before multi-tier system
   */
  async getImagesWithoutThumbnails(): Promise<Array<{ imghash: string; imgloc: string; preview_path: string | null }>> {
    const rows = await this.db
      .selectFrom('imgs')
      .select(['imghash', 'imgloc', 'preview_path'])
      .where('thumb_path_sm', 'is', null)
      .execute();
    return rows;
  }

  /**
   * Get ALL images for force regeneration
   */
  async getAllImages(): Promise<Array<{ imghash: string; imgloc: string; preview_path: string | null }>> {
    const rows = await this.db
      .selectFrom('imgs')
      .select(['imghash', 'imgloc', 'preview_path'])
      .execute();
    return rows;
  }

  /**
   * Get images for a specific location (for location-specific fixes)
   */
  async getImagesByLocation(locid: string): Promise<Array<{ imghash: string; imgloc: string; preview_path: string | null }>> {
    const rows = await this.db
      .selectFrom('imgs')
      .select(['imghash', 'imgloc', 'preview_path'])
      .where('locid', '=', locid)
      .execute();
    return rows;
  }

  /**
   * Kanye9: Get RAW images that are missing preview extraction
   * These are files that have thumbnails but no preview (browser can't display RAW)
   */
  async getImagesWithoutPreviews(): Promise<Array<{ imghash: string; imgloc: string }>> {
    // RAW file extensions that need preview extraction
    const rawPattern = '%.nef';  // Start with NEF, most common
    const rows = await this.db
      .selectFrom('imgs')
      .select(['imghash', 'imgloc'])
      .where('preview_path', 'is', null)
      .where((eb) =>
        eb.or([
          eb('imgloc', 'like', '%.nef'),
          eb('imgloc', 'like', '%.NEF'),
          eb('imgloc', 'like', '%.cr2'),
          eb('imgloc', 'like', '%.CR2'),
          eb('imgloc', 'like', '%.cr3'),
          eb('imgloc', 'like', '%.CR3'),
          eb('imgloc', 'like', '%.arw'),
          eb('imgloc', 'like', '%.ARW'),
          eb('imgloc', 'like', '%.dng'),
          eb('imgloc', 'like', '%.DNG'),
          eb('imgloc', 'like', '%.orf'),
          eb('imgloc', 'like', '%.ORF'),
          eb('imgloc', 'like', '%.raf'),
          eb('imgloc', 'like', '%.RAF'),
          eb('imgloc', 'like', '%.rw2'),
          eb('imgloc', 'like', '%.RW2'),
        ])
      )
      .execute();
    return rows;
  }

  /**
   * Update thumbnail path for an image
   */
  async updateImageThumbnailPath(imghash: string, thumbPath: string): Promise<void> {
    await this.db
      .updateTable('imgs')
      .set({ thumb_path: thumbPath })
      .where('imghash', '=', imghash)
      .execute();
  }

  /**
   * Update preview path for a RAW image
   */
  async updateImagePreviewPath(imghash: string, previewPath: string): Promise<void> {
    await this.db
      .updateTable('imgs')
      .set({ preview_path: previewPath, preview_extracted: 1 })
      .where('imghash', '=', imghash)
      .execute();
  }

  /**
   * Update preview path with quality level (Migration 30)
   */
  async updateImagePreviewWithQuality(imghash: string, previewPath: string, quality: 'full' | 'embedded' | 'low'): Promise<void> {
    await this.db
      .updateTable('imgs')
      .set({ preview_path: previewPath, preview_extracted: 1, preview_quality: quality })
      .where('imghash', '=', imghash)
      .execute();
  }

  /**
   * Get DNG images that need LibRaw re-rendering (have low-quality embedded previews)
   * Returns DNGs where preview_quality is 'low' or 'embedded' (not yet rendered via LibRaw)
   */
  async getDngImagesNeedingLibraw(): Promise<Array<{ imghash: string; imgloc: string; meta_width: number | null; meta_height: number | null }>> {
    const rows = await this.db
      .selectFrom('imgs')
      .select(['imghash', 'imgloc', 'meta_width', 'meta_height'])
      .where((eb) =>
        eb.or([
          eb('imgloc', 'like', '%.dng'),
          eb('imgloc', 'like', '%.DNG'),
        ])
      )
      .where((eb) =>
        eb.or([
          eb('preview_quality', 'is', null),
          eb('preview_quality', '=', 'low'),
          eb('preview_quality', '=', 'embedded'),
        ])
      )
      .execute();
    return rows;
  }

  /**
   * Get videos without poster frames (legacy - checks thumb_path)
   */
  async getVideosWithoutPosters(): Promise<Array<{ vidhash: string; vidloc: string }>> {
    const rows = await this.db
      .selectFrom('vids')
      .select(['vidhash', 'vidloc'])
      .where('thumb_path', 'is', null)
      .execute();
    return rows;
  }

  /**
   * DECISION-020: Get videos without multi-tier thumbnails
   */
  async getVideosWithoutThumbnails(): Promise<Array<{ vidhash: string; vidloc: string }>> {
    const rows = await this.db
      .selectFrom('vids')
      .select(['vidhash', 'vidloc'])
      .where('thumb_path_sm', 'is', null)
      .execute();
    return rows;
  }

  /**
   * DECISION-020: Get ALL videos for force regeneration
   */
  async getAllVideos(): Promise<Array<{ vidhash: string; vidloc: string }>> {
    const rows = await this.db
      .selectFrom('vids')
      .select(['vidhash', 'vidloc'])
      .execute();
    return rows;
  }

  /**
   * Get videos for a specific location (for location-specific fixes)
   */
  async getVideosByLocation(locid: string): Promise<Array<{ vidhash: string; vidloc: string }>> {
    const rows = await this.db
      .selectFrom('vids')
      .select(['vidhash', 'vidloc'])
      .where('locid', '=', locid)
      .execute();
    return rows;
  }

  /**
   * Update poster frame path for a video
   */
  async updateVideoPosterPath(vidhash: string, posterPath: string): Promise<void> {
    await this.db
      .updateTable('vids')
      .set({ thumb_path: posterPath, poster_extracted: 1 })
      .where('vidhash', '=', vidhash)
      .execute();
  }

  /**
   * Update XMP sync status for an image
   */
  async updateImageXmpStatus(imghash: string, synced: boolean): Promise<void> {
    await this.db
      .updateTable('imgs')
      .set({
        xmp_synced: synced ? 1 : 0,
        xmp_modified_at: new Date().toISOString()
      })
      .where('imghash', '=', imghash)
      .execute();
  }

  // ==================== HIDDEN/LIVE PHOTO OPERATIONS ====================

  /**
   * Set hidden status for an image
   */
  async setImageHidden(imghash: string, hidden: boolean, reason: string | null = 'user'): Promise<void> {
    await this.db
      .updateTable('imgs')
      .set({
        hidden: hidden ? 1 : 0,
        hidden_reason: hidden ? reason : null
      })
      .where('imghash', '=', imghash)
      .execute();
  }

  /**
   * Set hidden status for a video
   */
  async setVideoHidden(vidhash: string, hidden: boolean, reason: string | null = 'user'): Promise<void> {
    await this.db
      .updateTable('vids')
      .set({
        hidden: hidden ? 1 : 0,
        hidden_reason: hidden ? reason : null
      })
      .where('vidhash', '=', vidhash)
      .execute();
  }

  /**
   * Set hidden status for a document
   */
  async setDocumentHidden(dochash: string, hidden: boolean, reason: string | null = 'user'): Promise<void> {
    await this.db
      .updateTable('docs')
      .set({
        hidden: hidden ? 1 : 0,
        hidden_reason: hidden ? reason : null
      })
      .where('dochash', '=', dochash)
      .execute();
  }

  /**
   * Mark image as Live Photo
   */
  async setImageLivePhoto(imghash: string, isLivePhoto: boolean): Promise<void> {
    await this.db
      .updateTable('imgs')
      .set({ is_live_photo: isLivePhoto ? 1 : 0 })
      .where('imghash', '=', imghash)
      .execute();
  }

  /**
   * Mark video as Live Photo (the video component)
   */
  async setVideoLivePhoto(vidhash: string, isLivePhoto: boolean): Promise<void> {
    await this.db
      .updateTable('vids')
      .set({ is_live_photo: isLivePhoto ? 1 : 0 })
      .where('vidhash', '=', vidhash)
      .execute();
  }

  /**
   * Get all images by location with their original filenames (for Live Photo matching)
   */
  async getImageFilenamesByLocation(locid: string): Promise<Array<{ imghash: string; imgnamo: string }>> {
    const rows = await this.db
      .selectFrom('imgs')
      .select(['imghash', 'imgnamo'])
      .where('locid', '=', locid)
      .execute();
    return rows;
  }

  /**
   * Get all videos by location with their original filenames (for Live Photo matching)
   */
  async getVideoFilenamesByLocation(locid: string): Promise<Array<{ vidhash: string; vidnamo: string }>> {
    const rows = await this.db
      .selectFrom('vids')
      .select(['vidhash', 'vidnamo'])
      .where('locid', '=', locid)
      .execute();
    return rows;
  }

  // ==================== DELETE OPERATIONS ====================

  /**
   * Delete an image by hash (removes DB record only, file deletion handled by caller)
   */
  async deleteImage(imghash: string): Promise<void> {
    await this.db
      .deleteFrom('imgs')
      .where('imghash', '=', imghash)
      .execute();
  }

  /**
   * Delete a video by hash (removes DB record only, file deletion handled by caller)
   */
  async deleteVideo(vidhash: string): Promise<void> {
    await this.db
      .deleteFrom('vids')
      .where('vidhash', '=', vidhash)
      .execute();
  }

  /**
   * Delete a document by hash (removes DB record only, file deletion handled by caller)
   */
  async deleteDocument(dochash: string): Promise<void> {
    await this.db
      .deleteFrom('docs')
      .where('dochash', '=', dochash)
      .execute();
  }

  // ==================== MOVE OPERATIONS ====================

  /**
   * Move an image to a different sub-location
   */
  async moveImageToSubLocation(imghash: string, subid: string | null): Promise<void> {
    await this.db
      .updateTable('imgs')
      .set({ subid })
      .where('imghash', '=', imghash)
      .execute();
  }

  /**
   * Move a video to a different sub-location
   */
  async moveVideoToSubLocation(vidhash: string, subid: string | null): Promise<void> {
    await this.db
      .updateTable('vids')
      .set({ subid })
      .where('vidhash', '=', vidhash)
      .execute();
  }

  /**
   * Move a document to a different sub-location
   */
  async moveDocumentToSubLocation(dochash: string, subid: string | null): Promise<void> {
    await this.db
      .updateTable('docs')
      .set({ subid })
      .where('dochash', '=', dochash)
      .execute();
  }

}
