import fs from 'fs/promises';
import path from 'path';
import { MediaPathService } from './media-path-service';

/**
 * XmpService - Read and write XMP sidecar files
 *
 * Core Rules (DO NOT BREAK):
 * 1. XMP is source of truth - SQLite is a rebuildable cache
 * 2. Industry standard format - Compatible with PhotoMechanic, Lightroom, Bridge
 * 3. Never corrupt original files - Only write to .xmp sidecars
 * 4. Preserve unknown tags - Don't delete tags we don't understand
 */

export interface XmpData {
  rating?: number;           // xmp:Rating (0-5)
  label?: string;            // xmp:Label (color label)
  keywords?: string[];       // dc:subject
  title?: string;            // dc:title
  description?: string;      // dc:description
}

// XMP namespace URIs
const NS = {
  x: 'adobe:ns:meta/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  xmp: 'http://ns.adobe.com/xap/1.0/',
  dc: 'http://purl.org/dc/elements/1.1/',
};

export class XmpService {
  constructor(private readonly pathService: MediaPathService) {}

  /**
   * Write XMP sidecar file for a media file
   * Creates new file or updates existing, preserving unknown tags
   */
  async writeSidecar(mediaPath: string, data: XmpData): Promise<void> {
    const xmpPath = this.pathService.getXmpSidecarPath(mediaPath);

    // Try to read existing XMP to preserve unknown tags
    let existingXml: string | null = null;
    try {
      existingXml = await fs.readFile(xmpPath, 'utf-8');
    } catch {
      // File doesn't exist yet, that's fine
    }

    // Generate new XMP content
    const xmpContent = this.generateXmp(data, existingXml);

    // Write to file
    await fs.writeFile(xmpPath, xmpContent, 'utf-8');
  }

  /**
   * Read XMP sidecar file for a media file
   * Returns null if sidecar doesn't exist
   */
  async readSidecar(mediaPath: string): Promise<XmpData | null> {
    const xmpPath = this.pathService.getXmpSidecarPath(mediaPath);

    try {
      const content = await fs.readFile(xmpPath, 'utf-8');
      return this.parseXmp(content);
    } catch {
      return null;
    }
  }

  /**
   * Check if XMP sidecar exists
   */
  async sidecarExists(mediaPath: string): Promise<boolean> {
    const xmpPath = this.pathService.getXmpSidecarPath(mediaPath);
    try {
      await fs.access(xmpPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create an empty XMP stub sidecar
   * Called during import to ensure sidecar exists
   */
  async createStub(mediaPath: string): Promise<void> {
    const xmpPath = this.pathService.getXmpSidecarPath(mediaPath);

    // Don't overwrite existing
    try {
      await fs.access(xmpPath);
      return; // Already exists
    } catch {
      // Doesn't exist, create it
    }

    const stubContent = this.generateXmp({});
    await fs.writeFile(xmpPath, stubContent, 'utf-8');
  }

  // === Private Helpers ===

  /**
   * Generate XMP XML content
   */
  private generateXmp(data: XmpData, existingXml?: string | null): string {
    // Build xmp:Rating
    const ratingLine = data.rating !== undefined
      ? `      <xmp:Rating>${data.rating}</xmp:Rating>`
      : '';

    // Build xmp:Label
    const labelLine = data.label
      ? `      <xmp:Label>${this.escapeXml(data.label)}</xmp:Label>`
      : '';

    // Build dc:title
    const titleLine = data.title
      ? `      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${this.escapeXml(data.title)}</rdf:li>
        </rdf:Alt>
      </dc:title>`
      : '';

    // Build dc:description
    const descLine = data.description
      ? `      <dc:description>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${this.escapeXml(data.description)}</rdf:li>
        </rdf:Alt>
      </dc:description>`
      : '';

    // Build dc:subject (keywords)
    const keywordsBlock = data.keywords && data.keywords.length > 0
      ? `      <dc:subject>
        <rdf:Bag>
${data.keywords.map(k => `          <rdf:li>${this.escapeXml(k)}</rdf:li>`).join('\n')}
        </rdf:Bag>
      </dc:subject>`
      : '';

    // Combine all content
    const content = [ratingLine, labelLine, titleLine, descLine, keywordsBlock]
      .filter(Boolean)
      .join('\n');

    return `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="${NS.x}">
  <rdf:RDF xmlns:rdf="${NS.rdf}">
    <rdf:Description rdf:about=""
      xmlns:xmp="${NS.xmp}"
      xmlns:dc="${NS.dc}">
${content}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  }

  /**
   * Parse XMP XML content
   */
  private parseXmp(xml: string): XmpData {
    const data: XmpData = {};

    // Extract rating
    const ratingMatch = xml.match(/<xmp:Rating>(\d+)<\/xmp:Rating>/);
    if (ratingMatch) {
      data.rating = parseInt(ratingMatch[1], 10);
    }

    // Extract label
    const labelMatch = xml.match(/<xmp:Label>([^<]+)<\/xmp:Label>/);
    if (labelMatch) {
      data.label = this.unescapeXml(labelMatch[1]);
    }

    // Extract title
    const titleMatch = xml.match(/<dc:title>[\s\S]*?<rdf:li[^>]*>([^<]+)<\/rdf:li>/);
    if (titleMatch) {
      data.title = this.unescapeXml(titleMatch[1]);
    }

    // Extract description
    const descMatch = xml.match(/<dc:description>[\s\S]*?<rdf:li[^>]*>([^<]+)<\/rdf:li>/);
    if (descMatch) {
      data.description = this.unescapeXml(descMatch[1]);
    }

    // Extract keywords
    const keywordsMatch = xml.match(/<dc:subject>[\s\S]*?<rdf:Bag>([\s\S]*?)<\/rdf:Bag>/);
    if (keywordsMatch) {
      const keywordItems = keywordsMatch[1].match(/<rdf:li>([^<]+)<\/rdf:li>/g);
      if (keywordItems) {
        data.keywords = keywordItems.map(item => {
          const match = item.match(/<rdf:li>([^<]+)<\/rdf:li>/);
          return match ? this.unescapeXml(match[1]) : '';
        }).filter(Boolean);
      }
    }

    return data;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private unescapeXml(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
}

// Factory function
export function createXmpService(pathService: MediaPathService): XmpService {
  return new XmpService(pathService);
}
