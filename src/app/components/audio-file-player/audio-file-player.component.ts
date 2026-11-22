/**
 * Morse Code Studio
 */

import { Component, Input } from '@angular/core';
import { AudioFileService } from '../../services/audio-file.service';

/**
 * The Load button for an audio file and, once a file is loaded, its player: one
 * Play/Pause button with the slider beside it and the times under the slider.
 * While a file is loaded the Load button (in the CW scope) shows the same icon
 * crossed by a diagonal line and stops and unloads the file. The player sits along
 * the bottom of the output area, on the main screen (`main`, parchment
 * look) and in full screen (`fs`, dark look). The browser plays and decodes the
 * file; this is only the controls (see `AudioFileService`).
 */
@Component({
  selector: 'app-audio-file-player',
  standalone: true,
  host: { '[class.fs]': "variant === 'fs'" },
  templateUrl: './audio-file-player.component.html',
  styleUrl: './audio-file-player.component.css',
})
export class AudioFilePlayerComponent {
  /** Look: parchment (main screen) or dark (full screen) */
  @Input() variant: 'main' | 'fs' = 'main';
  /** `load`: the round Load (or, with a file loaded, Stop) button; `bar`: the player along the bottom of the output area, shown once a file is loaded */
  @Input() part: 'load' | 'bar' = 'load';
  /** Never show the Load button (a loaded file's Stop button stays) */
  @Input() hideLoad = false;

  /** The slider position while it is being dragged (seconds); null when it follows the file */
  dragValue: number | null = null;

  constructor(public file: AudioFileService) {}

  get sliderValue(): number {
    return this.dragValue ?? this.file.position();
  }

  onDrag(event: Event): void {
    this.dragValue = +(event.target as HTMLInputElement).value;
  }

  /** The slider was released: jump there */
  onSeek(event: Event): void {
    const slider = event.target as HTMLInputElement;
    this.file.seek(+slider.value);
    this.dragValue = null;
    // A focused slider would keep the arrow keys; the keyers need them
    slider.blur();
  }

  /** `m:ss` (or `h:mm:ss` past an hour) */
  clock(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  }
}
