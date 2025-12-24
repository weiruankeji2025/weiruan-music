#!/usr/bin/env python3
"""
Write metadata (cover and lyrics) to music files using mutagen
Supports: MP3, FLAC, M4A/MP4, OGG, OPUS
"""

import sys
import json
import os
import requests
from urllib.parse import urlparse

def get_image_data(cover_source):
    """Get image data from URL or file path"""
    if not cover_source:
        return None, None

    # Check if it's a URL
    if cover_source.startswith('http://') or cover_source.startswith('https://'):
        try:
            response = requests.get(cover_source, timeout=10)
            response.raise_for_status()
            content_type = response.headers.get('content-type', 'image/jpeg')
            if 'png' in content_type:
                mime_type = 'image/png'
            elif 'gif' in content_type:
                mime_type = 'image/gif'
            else:
                mime_type = 'image/jpeg'
            return response.content, mime_type
        except Exception as e:
            print(f"Error downloading cover: {e}", file=sys.stderr)
            return None, None
    else:
        # It's a file path
        if os.path.exists(cover_source):
            try:
                with open(cover_source, 'rb') as f:
                    data = f.read()
                ext = os.path.splitext(cover_source)[1].lower()
                if ext == '.png':
                    mime_type = 'image/png'
                elif ext == '.gif':
                    mime_type = 'image/gif'
                else:
                    mime_type = 'image/jpeg'
                return data, mime_type
            except Exception as e:
                print(f"Error reading cover file: {e}", file=sys.stderr)
                return None, None
    return None, None

def write_mp3_metadata(filepath, cover_data, cover_mime, lyrics, title=None, artist=None):
    """Write metadata to MP3 file using ID3 tags"""
    from mutagen.mp3 import MP3
    from mutagen.id3 import ID3, APIC, USLT, TIT2, TPE1, ID3NoHeaderError

    try:
        audio = MP3(filepath)
    except Exception:
        audio = MP3()

    # Create ID3 tags if they don't exist
    try:
        audio.add_tags()
    except Exception:
        pass

    # Write cover image (APIC frame)
    if cover_data and cover_mime:
        # Remove existing APIC frames
        audio.tags.delall('APIC')
        audio.tags.add(APIC(
            encoding=3,  # UTF-8
            mime=cover_mime,
            type=3,  # Cover (front)
            desc='Cover',
            data=cover_data
        ))

    # Write lyrics (USLT frame)
    if lyrics:
        # Remove existing USLT frames
        audio.tags.delall('USLT')
        audio.tags.add(USLT(
            encoding=3,  # UTF-8
            lang='chi',  # Chinese
            desc='Lyrics',
            text=lyrics
        ))

    # Write title
    if title:
        audio.tags.delall('TIT2')
        audio.tags.add(TIT2(encoding=3, text=title))

    # Write artist
    if artist:
        audio.tags.delall('TPE1')
        audio.tags.add(TPE1(encoding=3, text=artist))

    audio.save()
    return True

def write_flac_metadata(filepath, cover_data, cover_mime, lyrics, title=None, artist=None):
    """Write metadata to FLAC file"""
    from mutagen.flac import FLAC, Picture

    audio = FLAC(filepath)

    # Write cover image
    if cover_data and cover_mime:
        # Clear existing pictures
        audio.clear_pictures()

        picture = Picture()
        picture.type = 3  # Cover (front)
        picture.mime = cover_mime
        picture.desc = 'Cover'
        picture.data = cover_data
        audio.add_picture(picture)

    # Write lyrics
    if lyrics:
        audio['lyrics'] = lyrics

    # Write title
    if title:
        audio['title'] = title

    # Write artist
    if artist:
        audio['artist'] = artist

    audio.save()
    return True

def write_m4a_metadata(filepath, cover_data, cover_mime, lyrics, title=None, artist=None):
    """Write metadata to M4A/MP4 file"""
    from mutagen.mp4 import MP4, MP4Cover

    audio = MP4(filepath)

    # Write cover image
    if cover_data and cover_mime:
        if 'png' in cover_mime:
            cover_format = MP4Cover.FORMAT_PNG
        else:
            cover_format = MP4Cover.FORMAT_JPEG
        audio['covr'] = [MP4Cover(cover_data, imageformat=cover_format)]

    # Write lyrics
    if lyrics:
        audio['\xa9lyr'] = lyrics

    # Write title
    if title:
        audio['\xa9nam'] = title

    # Write artist
    if artist:
        audio['\xa9ART'] = artist

    audio.save()
    return True

def write_ogg_metadata(filepath, cover_data, cover_mime, lyrics, title=None, artist=None):
    """Write metadata to OGG/OPUS file"""
    from mutagen.oggvorbis import OggVorbis
    from mutagen.oggopus import OggOpus
    from mutagen.flac import Picture
    import base64

    ext = os.path.splitext(filepath)[1].lower()

    if ext == '.opus':
        audio = OggOpus(filepath)
    else:
        audio = OggVorbis(filepath)

    # Write cover image (as base64 encoded FLAC Picture)
    if cover_data and cover_mime:
        picture = Picture()
        picture.type = 3
        picture.mime = cover_mime
        picture.desc = 'Cover'
        picture.data = cover_data

        # Encode as base64
        picture_data = base64.b64encode(picture.write()).decode('ascii')
        audio['metadata_block_picture'] = [picture_data]

    # Write lyrics
    if lyrics:
        audio['lyrics'] = lyrics

    # Write title
    if title:
        audio['title'] = title

    # Write artist
    if artist:
        audio['artist'] = artist

    audio.save()
    return True

def write_metadata(filepath, cover_source=None, lyrics=None, title=None, artist=None):
    """Main function to write metadata to any supported audio file"""
    if not os.path.exists(filepath):
        return {'success': False, 'error': f'File not found: {filepath}'}

    ext = os.path.splitext(filepath)[1].lower()

    # Get cover image data
    cover_data, cover_mime = get_image_data(cover_source)

    try:
        if ext == '.mp3':
            write_mp3_metadata(filepath, cover_data, cover_mime, lyrics, title, artist)
        elif ext == '.flac':
            write_flac_metadata(filepath, cover_data, cover_mime, lyrics, title, artist)
        elif ext in ['.m4a', '.mp4', '.aac']:
            write_m4a_metadata(filepath, cover_data, cover_mime, lyrics, title, artist)
        elif ext in ['.ogg', '.opus']:
            write_ogg_metadata(filepath, cover_data, cover_mime, lyrics, title, artist)
        else:
            return {'success': False, 'error': f'Unsupported format: {ext}'}

        result = {'success': True, 'file': filepath}
        if cover_data:
            result['cover_written'] = True
        if lyrics:
            result['lyrics_written'] = True
        if title:
            result['title_written'] = True
        if artist:
            result['artist_written'] = True
        return result

    except Exception as e:
        return {'success': False, 'error': str(e)}

def main():
    """CLI interface - accepts JSON input from stdin or command line args"""
    if len(sys.argv) > 1:
        # Command line mode: python write_metadata.py <json_params>
        try:
            params = json.loads(sys.argv[1])
        except json.JSONDecodeError:
            print(json.dumps({'success': False, 'error': 'Invalid JSON parameter'}))
            sys.exit(1)
    else:
        # Stdin mode
        try:
            params = json.load(sys.stdin)
        except json.JSONDecodeError:
            print(json.dumps({'success': False, 'error': 'Invalid JSON input'}))
            sys.exit(1)

    filepath = params.get('filepath')
    cover = params.get('cover')
    lyrics = params.get('lyrics')
    title = params.get('title')
    artist = params.get('artist')

    if not filepath:
        print(json.dumps({'success': False, 'error': 'filepath is required'}))
        sys.exit(1)

    result = write_metadata(filepath, cover, lyrics, title, artist)
    print(json.dumps(result, ensure_ascii=False))

    if result['success']:
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == '__main__':
    main()
